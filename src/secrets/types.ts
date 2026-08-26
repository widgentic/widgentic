/**
 * Envelope encryption for per-principal secrets. A fresh 256-bit data key
 * encrypts each value with AES-256-GCM; the data key is wrapped by a
 * key-encryption key (KEK) the process never holds in production — Key
 * Vault wraps and unwraps it. The store persists only this record.
 */
export interface EnvelopeRecord {
  /** Content-encryption algorithm; only `A256GCM` exists today. */
  alg: "A256GCM";
  /** Which KEK version wrapped the data key — rotation bookkeeping. */
  kekVersion: string;
  /** The wrapped data key, base64. */
  wrappedKey: string;
  /** GCM nonce, base64 (96 bits). */
  iv: string;
  /** Ciphertext, base64. */
  ciphertext: string;
  /** GCM authentication tag, base64 (128 bits). */
  tag: string;
}

/**
 * The wrap/unwrap port. Implementations: the local development cipher and
 * the Key Vault cipher. Neither ever sees a secret value — only data keys.
 */
export interface SecretCipher {
  /** Wrap a raw data key; returns the wrapped bytes and the KEK version used. */
  wrap(dataKey: Uint8Array): Promise<{ wrappedKey: Uint8Array; kekVersion: string }>;
  /** Unwrap a data key wrapped under `kekVersion`. */
  unwrap(wrappedKey: Uint8Array, kekVersion: string): Promise<Uint8Array>;
}

/** Largest secret value accepted, in UTF-8 bytes. */
export const SECRET_VALUE_MAX_BYTES = 4_096;

export type SecretErrorCode =
  | "INVALID_SECRET_NAME"
  | "SECRET_TOO_LARGE"
  | "INVALID_ENVELOPE"
  | "DECRYPTION_FAILED";

export class SecretError extends Error {
  readonly code: SecretErrorCode;
  constructor(code: SecretErrorCode, message: string) {
    super(message);
    this.name = "SecretError";
    this.code = code;
  }
}
