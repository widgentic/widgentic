/**
 * widgentic/store — per-principal widgets, themes, schemas, shared actions,
 * secrets (ciphertext), API keys and the access grants bound to them.
 *
 * The port plus two reference implementations; the Cosmos adapter ships
 * from `@widgentic/mcp/store/cosmos`. Composition builds a request-scoped
 * catalog and theme registry so one principal's entries can never reach
 * another's session.
 */
export type {
  CreatedKey,
  Principal,
  PrincipalSettings,
  PrincipalSettingsUpdate,
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
export type { EnvelopeRecord } from "../secrets/index.js";
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
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_SECONDS,
  ANONYMOUS_TOKEN_PREFIX,
  AUTHORIZATION_CODE_PREFIX,
  AUTHORIZATION_CODE_SECONDS,
  CLIENT_NAME_MAX_LENGTH,
  DEFAULT_MAX_GRANTS,
  REFRESH_GRACE_SECONDS,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_SECONDS,
  generateAnonymousToken,
  isAnonymousAccessToken
} from "./grants.js";
export type {
  AccessGrantStore,
  AuthorizationCodeBinding,
  AuthorizationCodeRequest,
  CodeExchange,
  GrantRotation,
  IssuedTokens,
  StoredGrant,
  WritableAccessGrantStore
} from "./grants.js";
export {
  checkStoredWidget,
  checkStoredTheme,
  normalizeStoredTheme,
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
export { composeCatalog, composeResourceDomains, composeResources, composeThemes, readPrincipalSettings } from "./compose.js";
export type {
  ActionSource,
  CatalogComposeResult,
  ComposeOptions,
  ComposeResult,
  SettingsComposeOptions,
  SettingsRead
} from "./compose.js";
