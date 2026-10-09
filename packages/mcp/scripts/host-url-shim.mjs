// `URL` for the host bundle, injected by esbuild wherever bundled code names
// the global: the platform's implementation when the engine has one (Node,
// browsers), the spec-compliant core-js implementation otherwise (embedded
// engines such as ClearScript V8). Nothing global is written,
// so evaluating the bundle never changes the realm it runs in.
import PolyfillURL from "core-js-pure/stable/url/index.js";

const ShimURL = typeof globalThis.URL === "function" ? globalThis.URL : PolyfillURL;

export { ShimURL as URL };
