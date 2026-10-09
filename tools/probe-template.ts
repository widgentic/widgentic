/**
 * App-template probe: measures the served template and mounts real render
 * results in headless Chrome through a minimal fake host.
 *
 *   ./node_modules/.bin/tsx tools/probe-template.ts
 *
 * Prints `{ bytes: { raw, gzip }, handshake, mountMs, keyedReorder,
 * serverPreview }`: the byte size of `buildAppTemplate()` (gzip at level 9,
 * the size budget's measure), whether the bridge completed the
 * `ui/initialize` handshake, the median time from posting a `tool-result`
 * to the mounted DOM for a 200-row table and a 200-node tree, whether a
 * reversed keyed table kept every row element, whether a stored kind's
 * streaming input produced a `preview_widget` call whose answer mounted, and
 * the computed boxes of streaming image places (`imagePlaces`: an icon place
 * and a pending hero, in px — both must be non-zero). The frame is a
 * same-origin `srcdoc` iframe so the harness
 * can observe its DOM; real hosts sandbox harder, which does not change the
 * mount path. A handshake that never completes means the script did not run
 * — the parse-level failure jsdom cannot see.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { createCatalog } from "@widgentic/core";
import { buildAppTemplate, handleRenderWidget } from "@widgentic/mcp";

const RUNS = 7;

function structuredContentOf(input: unknown): unknown {
  const result = handleRenderWidget(createCatalog(), input);
  if (result.isError === true || result.structuredContent === undefined) {
    throw new Error(`render failed: ${JSON.stringify(result.content)}`);
  }
  return result.structuredContent;
}

const tableRows = Array.from({ length: 200 }, (_, i) => ({
  id: i,
  name: `Person ${i}`,
  role: i % 2 === 0 ? "Engineer" : "Designer",
  city: `City ${i % 17}`
}));
const treeRoots = Array.from({ length: 20 }, (_, b) => ({
  id: `b${b}`,
  label: `Branch ${b}`,
  children: Array.from({ length: 9 }, (_, l) => ({ id: `b${b}-${l}`, label: `Leaf ${b}.${l}`, children: [] }))
}));

const cases = {
  table200: {
    sc: structuredContentOf({ widget: "table", data: tableRows }),
    selector: "tbody tr",
    count: 200
  },
  tree200: {
    sc: structuredContentOf({ widget: "tree", data: treeRoots }),
    selector: "li.wg-tree-node",
    count: 200
  }
};

const reversed = structuredContentOf({ widget: "table", data: [...tableRows].reverse() });

const template = buildAppTemplate();
const bytes = {
  raw: Buffer.byteLength(template),
  gzip: gzipSync(template, { level: 9 }).length
};

// The harness page: a fake host that answers the handshake, then posts each
// case's tool-result into a fresh frame RUNS times and times the mount.
const harness = `<!doctype html><meta charset="utf-8"><body>
<script>
const TEMPLATE = ${JSON.stringify(template).replace(/</g, "\\u003c")};
const CASES = ${JSON.stringify(cases).replace(/</g, "\\u003c")};
const RUNS = ${RUNS};
const REVERSED = ${JSON.stringify(reversed).replace(/</g, "\\u003c")};
function freshFrame(capabilities) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    const timer = setTimeout(() => reject(new Error("handshake timed out")), 5000);
    function onMessage(event) {
      if (event.source !== frame.contentWindow) return;
      const m = event.data;
      if (m && m.method === "ui/initialize") {
        frame.contentWindow.postMessage({ jsonrpc: "2.0", id: m.id, result: {
          protocolVersion: "2026-01-26", hostCapabilities: capabilities || {}, hostContext: {} } }, "*");
      } else if (m && m.method === "ui/notifications/initialized") {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(frame);
      }
    }
    window.addEventListener("message", onMessage);
    frame.srcdoc = TEMPLATE;
    document.body.appendChild(frame);
  });
}
function mountOnce(frame, c) {
  return new Promise((resolve, reject) => {
    const doc = frame.contentDocument;
    const root = doc.getElementById("wg-root");
    const timer = setTimeout(() => reject(new Error("mount timed out")), 5000);
    let t0 = 0;
    const observer = new MutationObserver(() => {
      if (doc.querySelectorAll(c.selector).length === c.count) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(performance.now() - t0);
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    t0 = performance.now();
    frame.contentWindow.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result",
      params: { structuredContent: c.sc } }, "*");
  });
}
function nextTask() { return new Promise((resolve) => setTimeout(resolve, 50)); }
async function keyedReorder() {
  const frame = await freshFrame();
  await mountOnce(frame, CASES.table200);
  const before = [...frame.contentDocument.querySelectorAll("tbody tr")];
  frame.contentWindow.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result",
    params: { structuredContent: REVERSED } }, "*");
  await nextTask();
  const after = [...frame.contentDocument.querySelectorAll("tbody tr")];
  frame.remove();
  return after.length === before.length && after.every((row, i) => row === before[before.length - 1 - i]);
}
async function serverPreview() {
  const frame = await freshFrame({ serverTools: {} });
  let asked = false;
  window.addEventListener("message", (event) => {
    const m = event.data;
    if (event.source !== frame.contentWindow || !m || m.method !== "tools/call") return;
    asked = m.params && m.params.name === "preview_widget";
    frame.contentWindow.postMessage({ jsonrpc: "2.0", id: m.id, result: { structuredContent: {
      tree: { tag: "div", attrs: { class: "probe-person" }, children: ["Ada"] }, css: "" } } }, "*");
  });
  frame.contentWindow.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-input-partial",
    params: { arguments: { widget: "person", data: { name: "Ada" } } } }, "*");
  await nextTask();
  await nextTask();
  const mounted = frame.contentDocument.querySelector(".probe-person");
  const ok = asked && mounted !== null && frame.contentDocument.getElementById("wg-root").hasAttribute("data-wgd-preview");
  frame.remove();
  return ok;
}
async function imagePlaces() {
  const frame = await freshFrame();
  frame.style.width = "480px";
  frame.contentWindow.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-input-partial",
    params: { arguments: { widget: "group", data: { items: [
      { kind: "tree", data: [{ label: "Engineering", icon: "https://example.com/a.png", children: [] }] },
      { kind: "card", data: { title: "HQ", fields: { cover: "https://example.com/cover" } }, hints: { images: { cover: "hero" } } }
    ] } } } }, "*");
  await nextTask();
  const doc = frame.contentDocument;
  const box = (selector) => {
    const el = doc.querySelector(selector);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height)];
  };
  const out = { icon: box(".wg-img-icon.wg-img-pending"), hero: box(".wg-img-hero.wg-img-pending") };
  frame.remove();
  return out;
}
window.__probe = (async () => {
  const mountMs = {};
  let handshake = true;
  for (const [name, c] of Object.entries(CASES)) {
    const samples = [];
    for (let i = 0; i < RUNS; i++) {
      let frame;
      try { frame = await freshFrame(); } catch (e) { handshake = false; break; }
      samples.push(await mountOnce(frame, c));
      frame.remove();
    }
    samples.sort((a, b) => a - b);
    mountMs[name] = samples.length ? Math.round(samples[samples.length >> 1] * 10) / 10 : null;
  }
  return { handshake, mountMs, keyedReorder: await keyedReorder(), serverPreview: await serverPreview(),
    imagePlaces: await imagePlaces() };
})();
</script></body>`;

const dir = mkdtempSync(join(tmpdir(), "probe-template-"));
try {
  const page = join(dir, "harness.html");
  const expression = join(dir, "expression.js");
  writeFileSync(page, harness);
  writeFileSync(expression, "window.__probe");
  const probe = join(dirname(fileURLToPath(import.meta.url)), "probe-computed.mjs");
  const run = spawnSync(process.execPath, [probe, `file://${page}`, expression], { encoding: "utf8" });
  if (run.status !== 0) {
    console.error(run.stderr);
    process.exit(1);
  }
  const measured = JSON.parse(run.stdout) as Record<string, unknown>;
  console.log(JSON.stringify({ bytes, ...measured }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
