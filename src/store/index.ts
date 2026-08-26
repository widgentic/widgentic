/**
 * widgentic/store — per-principal widgets, themes, schemas, shared actions,
 * secrets (ciphertext) and API keys.
 *
 * The port plus two reference implementations; the Cosmos adapter ships
 * from `widgentic/store/cosmos`. Composition builds a request-scoped
 * catalog and theme registry so one principal's entries can never reach
 * another's session.
 */
export type {
  CreatedKey,
  Principal,
  Scope,
  SecretCipher,
  SecretEntry,
  StoredAction,
  StoredKey,
  StoredSchema,
  StoredSecret,
  StoredWidget,
  StoreLimits,
  StoreRejectionCode,
  WidgetStore,
  WritableWidgetStore
} from "./types.js";
export type { EnvelopeRecord } from "widgentic/secrets";
export {
  ANONYMOUS_PRINCIPAL,
  DEFAULT_LIMITS,
  KEY_SCOPES,
  normalizeKeyScopes,
  principalIdForSubject,
  StoreRejectionError
} from "./types.js";
export { hashKey, verifyKey, generateKey, findByKey, KEY_PREFIX } from "./keys.js";
export {
  checkStoredWidget,
  checkStoredTheme,
  checkStoredSchema,
  checkStoredAction,
  SAFE_IDENTIFIER
} from "./validate.js";
export type { EntryProblem } from "./validate.js";
export { createMemoryStore } from "./memory.js";
export { referencesToSecret, widgetsLoadingAction, widgetsReferencingAction } from "./refs.js";
export type { MemoryStore, MemorySeedPrincipal, MemoryStoreOptions } from "./memory.js";
export { createFileStore } from "./file.js";
export type { FileStoreOptions } from "./file.js";
export { composeCatalog, composeThemes } from "./compose.js";
export type { ActionSource, CatalogComposeResult, ComposeOptions, ComposeResult } from "./compose.js";
