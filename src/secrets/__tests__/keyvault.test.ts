import { describe, it, expect } from "vitest";
import { createKeyVaultCipher, kekVersionOf } from "../keyvault.js";
import type { CryptographyClientLike } from "../keyvault.js";
import { decryptSecret, encryptSecret, rewrapSecret } from "../index.js";

/** A fake vault: XOR "wrapping" tagged with a version — enough to prove the plumbing. */
function fakeClient(version: string, mask: number): CryptographyClientLike {
  const xor = (bytes: Uint8Array) => Uint8Array.from(bytes, (b) => b ^ mask);
  return {
    wrapKey: async (_alg, key) => ({ result: xor(key), keyID: `https://kv.example.vault.azure.net/keys/kek/${version}` }),
    unwrapKey: async (_alg, wrapped) => ({ result: xor(wrapped) })
  };
}

describe("Key Vault cipher", () => {
  it("extracts the KEK version from a key identifier", () => {
    expect(kekVersionOf("https://kv.example.vault.azure.net/keys/kek/abc123")).toBe("abc123");
  });

  it("wraps and unwraps through the client, naming the version it used", async () => {
    const cipher = await createKeyVaultCipher({ client: fakeClient("v1", 0x5a) });
    const record = await encryptSecret("value", cipher);
    expect(record.kekVersion).toBe("v1");
    expect(await decryptSecret(record, cipher)).toBe("value");
  });

  it("performs exactly one unwrap per resolution", async () => {
    let unwraps = 0;
    const counting: CryptographyClientLike = {
      ...fakeClient("v1", 0x11),
      unwrapKey: async (alg, w) => { unwraps++; return fakeClient("v1", 0x11).unwrapKey(alg, w); }
    };
    const cipher = await createKeyVaultCipher({ client: counting });
    const record = await encryptSecret("value", cipher);
    await decryptSecret(record, cipher);
    expect(unwraps).toBe(1);
  });

  it("rotation: old records unwrap through the previous version and re-wrap under the new", async () => {
    const v1 = await createKeyVaultCipher({ client: fakeClient("v1", 0x01) });
    const record = await encryptSecret("value", v1);
    const v2 = await createKeyVaultCipher({ client: fakeClient("v2", 0x02), previous: { v1: fakeClient("v1", 0x01) } });
    expect(await decryptSecret(record, v2)).toBe("value");
    const rewrapped = await rewrapSecret(record, v2);
    expect(rewrapped.kekVersion).toBe("v2");
    expect(rewrapped.ciphertext).toBe(record.ciphertext);
    expect(await decryptSecret(rewrapped, await createKeyVaultCipher({ client: fakeClient("v2", 0x02) }))).toBe("value");
  });

  it("needs either a client or keyId + credential", async () => {
    await expect(createKeyVaultCipher({})).rejects.toThrow(/client, or a keyId/);
  });
});
