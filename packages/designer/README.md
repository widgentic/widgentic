# @widgentic/designer

Hostable designers for widgentic: the widget designer (template tree, data
schema, sample data, styles, action bindings, live preview), plus standalone
theme, schema and action designers. Each is a function taking a container, and
each is also a custom element. Runs in the browser; depends only on
`@widgentic/core`.

```sh
npm install @widgentic/designer
```

```ts
import { createDesigner } from "@widgentic/designer";

const designer = createDesigner(document.querySelector("#host")!, { themes: [] });
designer.subscribe((draft) => save(draft));
```

Without a bundler, load the single-file bundle and use the elements:

```html
<script type="module" src="/node_modules/@widgentic/designer/dist/browser/widgentic-designer.js"></script>
<widgentic-designer></widgentic-designer>
```

MIT © Diego Hoyos
