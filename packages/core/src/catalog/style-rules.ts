/**
 * The style rules as text, built from the constants the guards enforce.
 * Both authoring guides, the tool descriptions and the designers' messages
 * read them from here, so none can drift from the guards or from another.
 */
import { PROPERTY_NAME, UNSAFE, UNSAFE_FUNCTIONS } from "./styles.js";

export const STYLE_RULES = {
  selectors:
    "Every selector part (split on top-level commas) must be held to .wg- classes: " +
    "one of its compounds names a .wg- class itself, or through :is() or :where() " +
    "whose every argument does. A .wg- class only inside :not(), :has(), an " +
    "attribute test or a string does not count, and no part may open with a " +
    "combinator — e.g. '.wg-card .wg-xcard-head', '.wg-row:has(.wg-ok, .wg-warn)' " +
    "or ':is(.wg-btn, .wg-link):hover'.",
  banned:
    `Selectors, properties, or values matching ${UNSAFE.source}, holding a ` +
    "comment marker (/* or */) or an unclosed bracket or string, or calling " +
    `${UNSAFE_FUNCTIONS.join(", ")} are dropped.`,
  // An ALLOWLIST, not merely "no banned characters": a property with a
  // digit or underscore is dropped even though it contains nothing banned.
  propertyNames:
    `Property names must match ${PROPERTY_NAME.source} (letters and ` +
    "hyphens, optionally leading '-'); anything else is dropped."
} as const;
