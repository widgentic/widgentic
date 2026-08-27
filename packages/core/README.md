# @widgentic/core

The widgentic engine: the `{ kind, data, hints?, meta? }` widget contract, data
adapters (JSON, CSV), the mapper, the widget catalog (card, table, tree, custom,
group and template-registered kinds), theming (`--wg-*` tokens), template
widgets with action bindings, and the reactive DOM renderer. Definitions,
validation and rendering only — no designer, server or persistence code, no
Node-only modules, so it runs in browsers and in Node alike.

```sh
npm install @widgentic/core
```

```ts
import { createCatalog, mountWidget } from "@widgentic/core";

const catalog = createCatalog();
const result = catalog.render({ kind: "card", data: { title: "Hello", fields: { a: 1 } } });
```

Every module is also importable on its own subpath: `@widgentic/core/contract`,
`/adapters`, `/mapper`, `/catalog`, `/theming`, `/templates`, `/actions`,
`/reactive`.

MIT © Diego Hoyos
