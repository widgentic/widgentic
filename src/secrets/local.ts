import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SecretCipher } from "./types.js";

/**
 * Development cipher: wraps data keys with AES-256-GCM under a KEK held in
 * memory (callers typically pass `WIDGENTIC_LOCAL_KEK`, 64 hex characters).
 * Same port, same record shape as production, no vault — for file-store
 * rigs and tests. Never the production path: the KEK lives in the process.
 */
export function createLocalCipher(hexKey: string, version = "local"): SecretCipher {
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error("Local KEK must be 64 hex characters (32 bytes).");
  }
  const kek = Buffer.from(hexKey, "hex");
  return {
    async wrap(dataKey) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", kek, iv);
      const body = Buffer.concat([cipher.update(dataKey), cipher.final()]);
      return {
        wrappedKey: Buffer.concat([iv, cipher.getAuthTag(), body]),
        kekVersion: version
      };
    },
    async unwrap(wrappedKey, kekVersion) {
      if (kekVersion !== version) {
        throw new Error(`Local cipher holds KEK version '${version}', record needs '${kekVersion}'.`);
      }
      const buffer = Buffer.from(wrappedKey);
      const iv = buffer.subarray(0, 12);
      const tag = buffer.subarray(12, 28);
      const body = buffer.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", kek, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]);
    }
  };
}

/** Generate a fresh local KEK as hex (for `WIDGENTIC_LOCAL_KEK`). */
export function generateLocalKek(): string {
  return randomBytes(32).toString("hex");
}
