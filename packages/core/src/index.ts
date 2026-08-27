/**
 * @widgentic/core — the widgentic engine: the { kind, data, hints?, meta? }
 * contract, data adapters, the mapper, the widget catalog, theming,
 * template widgets, actions and reactive rendering. Definitions,
 * validation and rendering only; runs in browsers and in Node. Every module
 * is also importable on its own subpath (`@widgentic/core/catalog`, …).
 */
export * from "./contract/index.js";
export * from "./adapters/index.js";
export * from "./mapper/index.js";
export * from "./catalog/index.js";
export * from "./theming/index.js";
export * from "./templates/index.js";
export * from "./actions/index.js";
export * from "./reactive/index.js";
export { isPlainObject } from "./shared/plain-object.js";
