/**
 * widgentic/store — per-principal widgets and themes.
 *
 * The port plus two reference implementations; no database is chosen
 * here. Composition builds a request-scoped catalog and theme registry so
 * one principal's entries can never reach another's session.
 */
export type {
  Principal,
  Scope,
  StoredWidget,
  StoreLimits,
  WidgetStore,
  WritableWidgetStore
} from "./types.js";
export {
  ANONYMOUS_PRINCIPAL,
  DEFAULT_LIMITS,
  StoreRejectionError
} from "./types.js";
export { hashKey, verifyKey, generateKey, findByKey, KEY_PREFIX } from "./keys.js";
export { checkStoredWidget, checkStoredTheme } from "./validate.js";
export type { EntryProblem } from "./validate.js";
export { createMemoryStore } from "./memory.js";
export type { MemoryStore, MemorySeedPrincipal } from "./memory.js";
export { createFileStore } from "./file.js";
export type { FileStoreOptions } from "./file.js";
export { composeCatalog, composeThemes } from "./compose.js";
export type { ComposeOptions, ComposeResult } from "./compose.js";
