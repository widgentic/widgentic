// Module-local stand-in for core-js's shared store, which core-js keeps on
// the realm's global object (`__core-js_shared__`): the host bundle neither
// reads nor writes realm globals, so its polyfill state lives here.
module.exports = {};
