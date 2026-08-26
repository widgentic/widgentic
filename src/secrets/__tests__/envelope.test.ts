import { describe, it, expect } from "vitest";
import {
  checkSecretName,
  checkSecretValue,
  createLocalCipher,
  decryptSecret,
  encryptSecret,
  generateLocalKek,
  rewrapSecret,
  SecretError
} from "../index.js";
import type { SecretCipher } from "../index.js";

const cipher = createLocalCipher(generateLocalKek());

describe("envelope encryption", () => {
  it("round-trips a value and never persists it", async () => {
    const record = await encryptSecret("sk-live-123", cipher);
    expect(record.alg).toBe("A256GCM");
    expect(JSON.stringify(record)).not.toContain("sk-live-123");
    expect(await decryptSecret(record, cipher)).toBe("sk-live-123");
  });

  it("the same value encrypts differently every time", async () => {
    const a = await encryptSecret("same", cipher);
    const b = await encryptSecret("same", cipher);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.wrappedKey).not.toBe(b.wrappedKey);
  });

  it("tampering fails closed", async () => {
    const record = await encryptSecret("value", cipher);
    const flipped = Buffer.from(record.tag, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    await expect(decryptSecret({ ...record, tag: flipped.toString("base64") }, cipher)).rejects.toBeInstanceOf(SecretError);
    await expect(decryptSecret({ ...record, alg: "none" }, cipher)).rejects.toMatchObject({ code: "INVALID_ENVELOPE" });
    const other = createLocalCipher(generateLocalKek());
    await expect(decryptSecret(record, other)).rejects.toMatchObject({ code: "DECRYPTION_FAILED" });
  });

  it("re-wrapping changes only the key material", async () => {
    const kek = generateLocalKek();
    const v1 = createLocalCipher(kek, "v1");
    const record = await encryptSecret("value", v1);
    const rotated: SecretCipher = {
      wrap: async (k) => ({ ...(await createLocalCipher(kek, "v2").wrap(k)), kekVersion: "v2" }),
      unwrap: (w, v) => (v === "v1" ? v1.unwrap(w, v) : createLocalCipher(kek, "v2").unwrap(w, v))
    };
    const rewrapped = await rewrapSecret(record, rotated);
    expect(rewrapped.kekVersion).toBe("v2");
    expect(rewrapped.wrappedKey).not.toBe(record.wrappedKey);
    expect([rewrapped.ciphertext, rewrapped.iv, rewrapped.tag]).toEqual([record.ciphertext, record.iv, record.tag]);
    expect(await decryptSecret(rewrapped, rotated)).toBe("value");
  });

  it("enforces name and size rules", () => {
    expect(checkSecretName("weather-token")).toBeUndefined();
    expect(checkSecretName("My Key")?.code).toBe("INVALID_SECRET_NAME");
    expect(checkSecretName("1abc")?.code).toBe("INVALID_SECRET_NAME");
    expect(checkSecretValue("x".repeat(4096))).toBeUndefined();
    expect(checkSecretValue("x".repeat(4097))?.code).toBe("SECRET_TOO_LARGE");
    expect(checkSecretValue("")?.code).toBe("SECRET_TOO_LARGE");
  });

  it("the local cipher refuses malformed keys", () => {
    expect(() => createLocalCipher("abc")).toThrow(/64 hex/);
  });
});
