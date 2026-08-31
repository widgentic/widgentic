import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SECRET_NAME } from "@widgentic/core";
import { errorMessage } from "../internal.js";
import { isPlainObject } from "@widgentic/core";
import type { EnvelopeRecord, SecretCipher } from "./types.js";
import { SECRET_VALUE_MAX_BYTES, SECRET_VALUE_MIN_BYTES, SecretError } from "./types.js";

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Strict base64 → bytes; `undefined` for anything Buffer would silently mangle. */
function decode(text: string): Buffer | undefined {
  if (text.length === 0 || !BASE64.test(text)) return undefined;
  return Buffer.from(text, "base64");
}

/** Name rule shared with action references (see `SECRET_NAME`). */
export function checkSecretName(name: unknown): SecretError | undefined {
  if (typeof name !== "string" || !SECRET_NAME.test(name)) {
    return new SecretError(
      "INVALID_SECRET_NAME",
      "Secret names are lowercase letters, digits and dashes, starting with a letter (max 64)."
    );
  }
  return undefined;
}

/** Value rule: a string of {@link SECRET_VALUE_MIN_BYTES} to {@link SECRET_VALUE_MAX_BYTES} UTF-8 bytes. */
export function checkSecretValue(value: unknown): SecretError | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return new SecretError("INVALID_SECRET_VALUE", "Secret value must be a non-empty string.");
  }
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < SECRET_VALUE_MIN_BYTES) {
    return new SecretError("INVALID_SECRET_VALUE", `Secret value must be at least ${SECRET_VALUE_MIN_BYTES} characters (UTF-8 bytes; anything shorter is a guessable token).`);
  }
  if (bytes > SECRET_VALUE_MAX_BYTES) {
    return new SecretError("SECRET_TOO_LARGE", `Secret value exceeds ${SECRET_VALUE_MAX_BYTES} characters (UTF-8 bytes).`);
  }
  return undefined;
}

/**
 * Encrypt a value: fresh random data key and nonce every time (so equal
 * values never share ciphertext), wrap the data key through the cipher.
 * The data key is zeroed whether or not wrapping succeeds.
 */
export async function encryptSecret(value: string, cipher: SecretCipher): Promise<EnvelopeRecord> {
  const sizeError = checkSecretValue(value);
  if (sizeError) throw sizeError;
  const dataKey = randomBytes(32);
  try {
    const iv = randomBytes(12);
    const encipher = createCipheriv("aes-256-gcm", dataKey, iv);
    const ciphertext = Buffer.concat([encipher.update(value, "utf8"), encipher.final()]);
    const tag = encipher.getAuthTag();
    const wrapped = await cipher.wrap(dataKey);
    return {
      alg: "A256GCM",
      kekVersion: wrapped.kekVersion,
      wrappedKey: b64(wrapped.wrappedKey),
      iv: b64(iv),
      ciphertext: b64(ciphertext),
      tag: b64(tag)
    };
  } finally {
    dataKey.fill(0);
  }
}

interface DecodedRecord {
  record: EnvelopeRecord;
  wrappedKey: Buffer;
  iv: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
}

/** Narrow and decode an untrusted record; every field is checked before any unwrap. */
function checkRecord(input: unknown): DecodedRecord {
  const invalid = (why: string) => new SecretError("INVALID_ENVELOPE", `Malformed secret record: ${why}.`);
  if (!isPlainObject(input)) throw invalid("not an object");
  const { alg, kekVersion, wrappedKey, iv, ciphertext, tag } = input;
  if (alg !== "A256GCM") throw invalid("unsupported algorithm");
  if (typeof kekVersion !== "string") throw invalid("kekVersion missing");
  const fields = { wrappedKey, iv, ciphertext, tag };
  const decoded: Partial<Record<keyof typeof fields, Buffer>> = {};
  for (const [name, text] of Object.entries(fields) as [keyof typeof fields, unknown][]) {
    if (typeof text !== "string") throw invalid(`${name} missing`);
    const bytes = decode(text);
    if (bytes === undefined) throw invalid(`${name} is not base64`);
    decoded[name] = bytes;
  }
  if (decoded.iv!.length !== 12) throw invalid("iv must be 12 bytes");
  if (decoded.tag!.length !== 16) throw invalid("tag must be 16 bytes");
  if (decoded.wrappedKey!.length === 0) throw invalid("wrapped key is empty");
  return {
    record: {
      alg: "A256GCM",
      kekVersion,
      wrappedKey: wrappedKey as string,
      iv: iv as string,
      ciphertext: ciphertext as string,
      tag: tag as string
    },
    wrappedKey: decoded.wrappedKey!,
    iv: decoded.iv!,
    ciphertext: decoded.ciphertext!,
    tag: decoded.tag!
  };
}

/** One unwrap through the cipher; any failure is a `DECRYPTION_FAILED`, never a raw cipher error. */
async function unwrapGuarded(decoded: DecodedRecord, cipher: SecretCipher): Promise<Uint8Array> {
  try {
    return await cipher.unwrap(decoded.wrappedKey, decoded.record.kekVersion);
  } catch (error) {
    throw new SecretError("DECRYPTION_FAILED", `Unwrap failed: ${errorMessage(error)}`);
  }
}

/** Decrypt a record: one unwrap through the cipher, then local AES-GCM. */
export async function decryptSecret(record: unknown, cipher: SecretCipher): Promise<string> {
  const decoded = checkRecord(record);
  const dataKey = await unwrapGuarded(decoded, cipher);
  try {
    const decipher = createDecipheriv("aes-256-gcm", dataKey, decoded.iv);
    decipher.setAuthTag(decoded.tag);
    const plain = Buffer.concat([decipher.update(decoded.ciphertext), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    throw new SecretError("DECRYPTION_FAILED", "Ciphertext or tag did not verify.");
  } finally {
    dataKey.fill(0);
  }
}

/**
 * Re-wrap the data key under the cipher's current KEK version. The value
 * is never decrypted: ciphertext, iv and tag are carried over byte for
 * byte, and nothing else from the input record is.
 */
export async function rewrapSecret(record: unknown, cipher: SecretCipher): Promise<EnvelopeRecord> {
  const decoded = checkRecord(record);
  const dataKey = await unwrapGuarded(decoded, cipher);
  try {
    const wrapped = await cipher.wrap(dataKey);
    return {
      alg: "A256GCM",
      kekVersion: wrapped.kekVersion,
      wrappedKey: b64(wrapped.wrappedKey),
      iv: decoded.record.iv,
      ciphertext: decoded.record.ciphertext,
      tag: decoded.record.tag
    };
  } finally {
    dataKey.fill(0);
  }
}
