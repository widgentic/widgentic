/**
 * Store limits and the identifier charset, in a module with no imports so
 * runtime-neutral code (the authoring guide, the validators, the host
 * bundle) can read them without loading anything Node-only.
 */

/**
 * Structural limits, per principal. Not economics — these exist so one
 * tenant cannot exhaust the server for the rest, and so a corrupt store
 * cannot load unbounded data.
 */
export interface StoreLimits {
  maxWidgets: number;
  maxThemes: number;
  maxSchemas: number;
  maxActions: number;
  maxSecrets: number;
  /** Serialized bytes of a single entry. */
  maxEntryBytes: number;
  /** Template nodes in a single stored template (structure, not output). */
  maxTemplateNodes: number;
}

export const DEFAULT_LIMITS: StoreLimits = {
  maxWidgets: 100,
  maxThemes: 50,
  maxSchemas: 50,
  maxActions: 50,
  maxSecrets: 50,
  maxEntryBytes: 65_536,
  maxTemplateNodes: 2_000
};

/**
 * One identifier charset for every adapter: the file store's path guard.
 * Backends encode identifiers differently (the Cosmos adapter embeds them
 * in document ids, where `/ \ # ?` are illegal); enforcing the rule at the
 * port means memory, file, and Cosmos accept and reject identically.
 */
export const SAFE_IDENTIFIER = /^[a-zA-Z0-9._-]+$/;
