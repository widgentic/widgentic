/**
 * The identifier rule for widget kinds and theme, schema and principal
 * names: one charset every store adapter accepts identically (the file
 * store uses it as a path guard; Cosmos embeds it in document ids). Kept
 * here so the store, the designers and the guides read the same rule.
 */
export const SAFE_IDENTIFIER = /^[a-zA-Z0-9._-]+$/;
