/**
 * Key Vault cipher: data keys are wrapped and unwrapped by the vault's
 * cryptographic operations (RSA-OAEP-256), so the KEK never exists in this
 * process. Ships from its own entry (`widgentic/secrets/keyvault`) because
 * `@azure/keyvault-keys` and `@azure/identity` are optional peers.
 *
 * Identity only: the identity needs the wrap/unwrap role on the key
 * (`Key Vault Crypto Service Encryption User`), nothing on secrets.
 */
import type { TokenCredential } from "@azure/identity";
import type { SecretCipher } from "./types.js";

/** Structural client: the real `CryptographyClient`, or a test double. */
export interface CryptographyClientLike {
  wrapKey(
    algorithm: "RSA-OAEP-256",
    key: Uint8Array
  ): Promise<{ result: Uint8Array; keyID?: string }>;
  unwrapKey(algorithm: "RSA-OAEP-256", encryptedKey: Uint8Array): Promise<{ result: Uint8Array }>;
}

export interface KeyVaultCipherOptions {
  /**
   * Full key identifier, e.g. https://<vault>.vault.azure.net/keys/<name>/<version>.
   * The version segment seeds the KEK version recorded on every wrap; a
   * versionless id records the version the vault reports instead.
   */
  keyId?: string;
  credential?: TokenCredential;
  /** Pre-built client (tests). When present no client is built, but `keyId` still seeds the version. */
  client?: CryptographyClientLike;
  /**
   * Clients for OTHER KEK versions, keyed by version — records wrapped
   * before a rotation unwrap through these until they are re-wrapped.
   */
  previous?: Record<string, CryptographyClientLike>;
}

/**
 * The version segment of a Key Vault key identifier
 * (`/keys/<name>/<version>`); `""` for a versionless id — never the key name.
 */
export function kekVersionOf(keyId: string): string {
  const match = /^\/keys\/[^/]+\/([^/]+)\/?$/.exec(new URL(keyId).pathname);
  return match?.[1] ?? "";
}

export async function createKeyVaultCipher(options: KeyVaultCipherOptions): Promise<SecretCipher> {
  let client = options.client;
  if (client === undefined) {
    if (options.keyId === undefined || options.credential === undefined) {
      throw new Error("Key Vault cipher needs a client, or a keyId and a credential.");
    }
    const { CryptographyClient } = await import("@azure/keyvault-keys");
    client = new CryptographyClient(options.keyId, options.credential);
  }
  // The configured id names the version whether or not a client was injected.
  let version = options.keyId !== undefined ? kekVersionOf(options.keyId) : "";
  const current = client;
  const previous = options.previous ?? {};
  return {
    async wrap(dataKey) {
      const wrapped = await current.wrapKey("RSA-OAEP-256", dataKey);
      const reported = wrapped.keyID !== undefined ? kekVersionOf(wrapped.keyID) : "";
      // A versionless id learns its version from the vault's first answer.
      if (version === "" && reported !== "") version = reported;
      return { wrappedKey: wrapped.result, kekVersion: reported || version };
    },
    async unwrap(wrappedKey, kekVersion) {
      const target = previous[kekVersion] ?? (kekVersion === version || version === "" ? current : undefined);
      if (target === undefined) {
        throw new Error(`Unknown KEK version '${kekVersion}' (current '${version}', previous: ${Object.keys(previous).join(", ") || "none"}).`);
      }
      const unwrapped = await target.unwrapKey("RSA-OAEP-256", wrappedKey);
      return unwrapped.result;
    }
  };
}
