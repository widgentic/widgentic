## Context

See proposal.md for the motivation. Current state:

- **The preview.** `packages/designer/src/preview.ts` mounts the draft with `mountWidget` into a `div.wgd-preview` in the host page.
  - Theme tokens go on that element through `applyTheme`.
  - Theme and widget styles are scoped with `themeStylesToCss(styles, '[data-wgd-scope=…]')`.
  - Bound elements get a designer badge class.
  - The theme designer previews built-ins and customs through the same controller.
- **The app template.** `packages/mcp/src/server/app-template.ts` builds the MCP Apps document. Its inline bridge:
  - sends `ui/initialize` and applies `hostContext` (`theme`, style variables);
  - mounts and keyed-patches `structuredContent.tree` from `ui/notifications/tool-result`, and applies `structuredContent.css` to `#wg-dynamic-css`;
  - reports `ui/notifications/size-changed`;
  - gates actions and theme-CSS calls on `hostCapabilities.serverTools`.
- **The authoring surface.** `packages/mcp/src/authoring` returns `{ status, body }` with a JSON body. Hosts resolve the principal and mount the Node adapter under `/api` (apps and `examples/docker`).
- **The hosts' frame policy.** `_meta.ui.csp.resourceDomains` maps to `img-src`, `script-src`, `style-src`, `font-src` and `media-src` (ext-apps `McpUiResourceCsp`). Claude and ChatGPT honored declared domains for stylesheets and fonts in the 2026-10-15 probe.
- **The page policy.** widgentic.dev's app CSP is `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; …`. A `srcdoc` or `about:blank` frame inherits that policy, so a preview that must load other origins needs a document served with its own policy.

## Goals / Non-Goals

**Goals:**

- **Same renderer.** The preview runs the same document, bridge and CSS application as a host frame.
- **Same frame policy.** The preview's CSP grants what hosts grant for the person's declared domains.
- **No style crossing.** Neither the page's styles nor the preview's reach the other.
- **No regressions.** Embedders without a server keep today's preview.

**Non-Goals:**

- Loading stylesheets from settings. That is the next change, and it will reach the island through `structuredContent` with no island-specific code.
- Scripts or web components.
- A light/dark host toggle. The frame follows the designer's color scheme.
- Running actions in the preview: it never executes, as today.

## Decisions

### D1. The island is the app template; the designer is a minimal host

The frame document is `buildAppTemplate()`, the bytes hosts mount, served by the authoring surface.
- **The designer side.** It speaks just enough of the MCP Apps protocol: answer `ui/initialize` with `hostContext` (the theme, and since D7's revision the host style variables) and no `hostCapabilities`, answer `ping`, hold messages until `initialized`, send one `ui/notifications/tool-result` per previewable revision, and apply `size-changed` to the iframe height.
- **Parity comes from the bridge.** The bridge does the mounting and keyed patching, and applies CSS and host context, so the island cannot drift from what hosts show.
- **Alternatives rejected:**
  - *A purpose-built frame page with its own mount script.* It would be a second renderer to keep in step with the template.
  - *Posting HTML for `innerHTML`.* It would lose in-place patching (scroll, open `details`) and still need a served document for the CSP.

### D2. The route lives in the authoring surface

`GET /preview-frame` joins the surface, so both hosts get it, with the principal they already resolve, by mounting what they mount today.
- **Response shape.** The surface's response gains an HTML variant (`{ status, headers, html }`) for this route alone. The Node adapter writes it as is; every other route keeps its JSON body.
- **The domains.** The operator's list comes from `deps.resourceDomains`, which the host passes. The principal's comes from the settings record through `readPrincipalSettings`/`composeResourceDomains`, the functions the MCP server uses, so the frame and the declaration cannot diverge.
- **No principal.** The route answers with the operator's list only. This mirrors "anonymous degrades, never errors" and keeps an embedded preview from breaking.

### D3. The policy: what hosts grant, minus what we do not use

```
default-src 'none'; script-src 'sha256-<inline script>'…;
style-src 'unsafe-inline' <domains>; img-src data: <domains>;
font-src <domains>; media-src <domains>; connect-src 'none';
frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'
```

- **Scripts.** `script-src` holds hashes of the template's own inline scripts, computed when the route builds the response, and leaves the resource domains out. Hosts would allow scripts from declared domains, but nothing widgentic renders loads a script, and scripts are out of scope. If a later change adds scripts, it decides this explicitly.
- **Headers.** `Cache-Control: no-store` (domains change with Settings), `X-Content-Type-Options: nosniff`, and no cookie.

### D4. The sandbox: `allow-scripts` only

- **Opaque origin.** Without `allow-same-origin`, the frame cannot read the app's cookies or storage, or call the authoring API with the person's session. That is how hosts isolate MCP Apps frames.
- **Cookies on the frame request.** The browser still attaches the session cookie to the iframe navigation itself, a same-site request, so the route can resolve the principal.
- **No popups.** Links are opened by the designer (D6).

### D5. What the designer sends, and in what order

The designer renders the tree through its existing pipeline (the scratch catalog and compile delegate), and builds `css` in the order a render's `css` uses:
1. the preview theme's styles (`themeStylesToCss(styles)`, unscoped);
2. the previewed kind's styles (`widgetStylesToCss`);
3. the theme's token declarations under `:root, :root[data-theme="dark"]`, the way an explicitly named theme applies to both modes;
4. a designer-only rule drawing the dashed outline and "⚡ action" badge on `[data-wg-action]`, which today sits in the designer's stylesheet under `.wgd-preview`.

`payload` rides along, so the template's payload-dependent paths see what a render gives them. A parity test in `@widgentic/mcp`, which may import the designer, compares the designer's tree and CSS order with `handleRenderWidget` for the same widget and theme.

### D6. Messages the frame may send

- `tools/call` gets a JSON-RPC error; the bridge already shows that a host cannot run widget actions.
- `ui/message` is answered with no composition.
- `ui/open-link` opens `window.open(url, "_blank", "noopener")` only for `http`, `https`, `mailto` and `tel`, and is refused otherwise.

Every message is accepted only when `event.source === iframe.contentWindow`. The frame's origin is `null`, so the window, not the origin, is the identity check.

### D7. The color scheme

`hostContext.theme` follows the designer's scheme: its pinned `appearance` when set, else the host page's `data-theme` on `<html>` when it is `light` or `dark`, otherwise `prefers-color-scheme`. A change re-sends `ui/notifications/host-context-changed`, which the bridge applies. Hosts behave this way, and the preview then matches the chrome around it.

**Revised during apply: the host palette.** The Chrome check (task 4.1) showed a dark page giving a frame with `data-theme="dark"` but a white background. The template maps eight tokens (`bg`, `fg`, `muted`, `border`, `accent`, `font-family`, `radius`, `shadow`) onto MCP Apps host style variables, whose fallbacks are the light defaults. Its dark overrides deliberately skip those eight, because hosts supply them. A host that sends only `theme` therefore gets light colors in dark mode.
- **The fix.** The designer now sends `hostContext.styles.variables` as well, valued from the built-in theme of the scheme: `darkTheme` in dark mode, the `TOKEN_SPECS` defaults otherwise. It sends them on initialize and on every scheme change.
- **No drift.** The variable names are restated in the designer, since it cannot import the template. A test in `@widgentic/mcp` parses the template's bridge and requires the designer to supply exactly those variables with those values.
- **Explicit themes.** A preview theme the person picked still applies to both modes, as `render_widget` with an explicit `theme` does. The built-in palette shows only under "none".

### D8. One controller, two modes

`createPreview` keeps its interface (`pane`, `kinds`, `update`, `dispose`).
- **With `previewFrame`:** the pane holds the iframe and the banner.
- **Without it:** today's mount, untouched.
- **Read-only mode** is unaffected: the preview stays live.
- **`dispose`** removes the message listener and the iframe.
- **No widget stylesheet in the page (added after the staging check).** In island mode the page does not get core's base widget stylesheet; only an in-page preview injects it. The browser agent found its 55 `.wg-*` rules in a page that no longer rendered a widget. Its retest then found the in-page preview's own rules still in the chrome stylesheet: the "⚡ action" marker and the `.wgd-preview` surface. They now sit in a separate stylesheet (`data-widgentic-designer-preview`) that only an in-page preview injects.

### D9. The self-host example

- `main.ts` sets `previewFrame: "/api/preview-frame"` on the widget and theme designers.
- **No operator list (revised during apply).** The plan was for `web.ts` to read `WIDGENTIC_RESOURCE_DOMAINS` into the authoring deps. Apply found that the example's MCP service has no operator list: it declares only each person's settings domains, and an anonymous caller declares none (its spec, "The MCP endpoint declares each caller's resource domains"). Reading the variable in the web service alone would make the frame grant origins the endpoint never declares, which breaks the goal "same frame policy". So the web service passes no `resourceDomains`, and the frame carries the person's domains only. The operator list in the deps is for hosts whose endpoint keeps one, such as widgentic.dev's MCP server.
- The page sets no CSP of its own (no header, no meta), so the same-origin frame is allowed. The frame's own `frame-ancestors 'self'` admits it.
- The test environment sets happy-dom's `disableIframePageLoading` for every suite, so a mounted island never reaches the network.

## Risks / Trade-offs

- **[The template evolves for hosts and the designer depends on it]** → That is the point: the island tracks hosts automatically. The protocol subset is the published MCP Apps one, not a private channel.
- **[Height jumps while the frame boots]** → The pane keeps the last height and a minimum. The first `size-changed` arrives within one frame of mounting.
- **[A misbehaving page posting messages]** → The source check (D6) ignores every window but the frame.
- **[Embedders without a server]** → They keep the in-page preview. The option is additive.
- **[Cost per keystroke]** → One `postMessage` with the tree and CSS per revision. The bridge patches in place, and the payload is the size of a render.

- **[Defaults per scheme]** → "(none — defaults)" previews widgentic's built-in light or dark, and a named pick applies to both modes. Neither shows a dark host under the person's dark default. Queued as BACKLOG THM-4.
- **[The self-host page has no policy of its own]** → Only the frame carries a CSP. Queued as BACKLOG EXM-1.

## Migration Plan

No stored data changes.
1. Apply on `feature/designer-preview-island`, deploy to staging, and check the island in the example app: style isolation, external images from declared domains, the size and the color scheme.
2. Merge, promote and release 0.14.0.
3. Adopt in `widgentic/apps`, which needs its own change: pass `resourceDomains` to the web process's authoring deps, set `previewFrame`, and confirm the app CSP allows the frame.
