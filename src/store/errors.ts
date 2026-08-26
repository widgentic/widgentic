import { SecretError } from "widgentic/secrets";
import { StoreRejectionError } from "./types.js";

/**
 * Every failure leaving a store is a `StoreRejectionError`: secret-layer
 * errors keep their code, anything else (transport, cipher SDK) becomes a
 * `STORE_ERROR` with a fixed message so no backend detail reaches callers.
 */
export function asStoreRejection(error: unknown, fallback: string): StoreRejectionError {
  if (error instanceof StoreRejectionError) return error;
  if (error instanceof SecretError) return new StoreRejectionError(error.code, error.message);
  return new StoreRejectionError("STORE_ERROR", fallback);
}
