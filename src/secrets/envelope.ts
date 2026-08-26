import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SECRET_NAME } from "../actions/types.js";
import type { EnvelopeRecord, SecretCipher } from "./types.js";
import { SECRET_VALUE_MAX_BYTES, SecretError } from "./types.js";

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
const unb64 = (text: string): Buffer => Buffer.from(text, "base64");

/** Name rule shared with action references (`^[a-z][a-z0-9-]{0,63}$`). */
export function checkSecretName(name: unknown): SecretError | undefined {
  if (typeof name !== "string" || !SECRET_NAME.test(name)) {
    return new SecretError(
      "INVALID_SECRET_NAME",
      "Secret names are lowercase letters, digits and dashes, starting with a letter (max 64)."
    );
  }
  return undefined;
}

/** Value rule: at most {@link SECRET_VALUE_MAX_BYTES} of UTF-8. */
export function checkSecretValue(value: unknown): SecretError | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return new SecretError("SECRET_TOO_LARGE", "Secret value must be a non-empty string.");
  }
  if (Buffer.byteLength(value, "utf8") > SECRET_VALUE_MAX_BYTES) {
    return new SecretError(
      "SECRET_TOO_LARGE",
      `Secret value exceeds ${SECRET_VALUE_MAX_BYTES} bytes.`
    );
  }
  return undefined;
}

/**
 * Encrypt a value: fresh random data key and nonce every time (so equal
 * values never share ciphertext), wrap the data key through the cipher.
 */
export async function encryptSecret(value: string, cipher: SecretCipher): Promise<EnvelopeRecord> {
  const sizeError = checkSecretValue(value);
  if (sizeError) throw sizeError;
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const encipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const ciphertext = Buffer.concat([encipher.update(value, "utf8"), encipher.final()]);
  const tag = encipher.getAuthTag();
  const wrapped = await cipher.wrap(dataKey);
  dataKey.fill(0);
  return {
    alg: "A256GCM",
    kekVersion: wrapped.kekVersion,
    wrappedKey: b64(wrapped.wrappedKey),
    iv: b64(iv),
    ciphertext: b64(ciphertext),
    tag: b64(tag)
  };
}

function checkRecord(record: unknown): EnvelopeRecord {
  const r = record as Partial<EnvelopeRecord> | null;
  if (
    r === null ||
    typeof r !== "object" ||
    r.alg !== "A256GCM" ||
    typeof r.kekVersion !== "string" ||
    typeof r.wrappedKey !== "string" ||
    typeof r.iv !== "string" ||
    typeof r.ciphertext !== "string" ||
    typeof r.tag !== "string"
  ) {
    throw new SecretError("INVALID_ENVELOPE", "Malformed secret record.");
  }
  return r as EnvelopeRecord;
}

/** Decrypt a record: one unwrap through the cipher, then local AES-GCM. */
export async function decryptSecret(record: unknown, cipher: SecretCipher): Promise<string> {
  const r = checkRecord(record);
  let dataKey: Uint8Array;
  try {
    dataKey = await cipher.unwrap(unb64(r.wrappedKey), r.kekVersion);
  } catch (error) {
    throw new SecretError("DECRYPTION_FAILED", `Unwrap failed: ${(error as Error).message}`);
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", dataKey, unb64(r.iv));
    decipher.setAuthTag(unb64(r.tag));
    const plain = Buffer.concat([decipher.update(unb64(r.ciphertext)), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    throw new SecretError("DECRYPTION_FAILED", "Ciphertext or tag did not verify.");
  } finally {
    Buffer.from(dataKey.buffer, dataKey.byteOffset, dataKey.byteLength).fill(0);
  }
}

/**
 * Re-wrap the data key under the cipher's current KEK version. The value
 * is never decrypted: ciphertext, iv and tag are carried over byte for byte.
 */
export async function rewrapSecret(record: unknown, cipher: SecretCipher): Promise<EnvelopeRecord> {
  const r = checkRecord(record);
  const dataKey = await cipher.unwrap(unb64(r.wrappedKey), r.kekVersion);
  const wrapped = await cipher.wrap(dataKey);
  Buffer.from(dataKey.buffer, dataKey.byteOffset, dataKey.byteLength).fill(0);
  return { ...r, wrappedKey: b64(wrapped.wrappedKey), kekVersion: wrapped.kekVersion };
}
