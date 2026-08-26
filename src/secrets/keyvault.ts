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
  /** Full key identifier, e.g. https://<vault>.vault.azure.net/keys/<name>/<version>. */
  keyId?: string;
  credential?: TokenCredential;
  /** Pre-built client (tests). When present, `keyId`/`credential` build nothing. */
  client?: CryptographyClientLike;
  /**
   * Clients for OTHER KEK versions, keyed by version — records wrapped
   * before a rotation unwrap through these until they are re-wrapped.
   */
  previous?: Record<string, CryptographyClientLike>;
}

/** The version segment of a Key Vault key identifier (last path segment). */
export function kekVersionOf(keyId: string): string {
  const segments = new URL(keyId).pathname.split("/").filter((s) => s.length > 0);
  return segments[segments.length - 1] ?? "";
}

export async function createKeyVaultCipher(options: KeyVaultCipherOptions): Promise<SecretCipher> {
  let client = options.client;
  let version = "";
  if (client === undefined) {
    if (options.keyId === undefined || options.credential === undefined) {
      throw new Error("Key Vault cipher needs a client, or a keyId and a credential.");
    }
    const { CryptographyClient } = await import("@azure/keyvault-keys");
    client = new CryptographyClient(options.keyId, options.credential) as CryptographyClientLike;
    version = kekVersionOf(options.keyId);
  }
  const current = client;
  const previous = options.previous ?? {};
  return {
    async wrap(dataKey) {
      const wrapped = await current.wrapKey("RSA-OAEP-256", dataKey);
      const kekVersion = wrapped.keyID !== undefined ? kekVersionOf(wrapped.keyID) : version;
      return { wrappedKey: wrapped.result, kekVersion };
    },
    async unwrap(wrappedKey, kekVersion) {
      const byVersion = previous[kekVersion];
      const target = byVersion ?? current;
      const unwrapped = await target.unwrapKey("RSA-OAEP-256", wrappedKey);
      return unwrapped.result;
    }
  };
}
