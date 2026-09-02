// WebMCP real-browser probe (expression file for tools/probe-computed.mjs).
// Run: CHROME_ARGS="--enable-features=WebMCPTesting,DevToolsWebMCPSupport" \
//        node tools/probe-computed.mjs http://localhost:8082/ tools/probe-webmcp.js
// Reports the page's own status line, what the browser lists, and — the part
// that matters — whether the DESIGNER changed after the agent-side call.
(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await sleep(600);
  const status = document.getElementById("agent-status")?.textContent ?? null;
  const surface = {
    documentModelContext: typeof document.modelContext,
    navigatorModelContext: typeof navigator.modelContext,
    navigatorTesting: typeof navigator.modelContextTesting
  };
  // Chrome 151: the testing surface lists with `listTools()`; the spec surface
  // (`document.modelContext`) carries `getTools()` / `executeTool(tool, input)`.
  const testing = navigator.modelContextTesting ?? document.modelContextTesting;
  const context = document.modelContext ?? navigator.modelContext;
  if (!testing && !context) return { status, surface, note: "no model context — is the flag on?" };
  // Prefer the spec surface's listing: its RegisteredTool entries carry
  // `origin`/`annotations` and are what `executeTool(tool, input)` accepts.
  const tools = context?.getTools ? await context.getTools() : await (testing.listTools ?? testing.getTools).call(testing);
  const testingListed = testing?.listTools ? (await testing.listTools()).map((t) => t.name) : null;
  const listed = tools.map((t) => ({ name: t.name, readOnly: t.annotations?.readOnlyHint === true }));
  const definition = {
    kind: "probe-card",
    template: { tag: "div", attrs: { class: "wg-template" }, children: [{ tag: "h2", children: [{ bind: "title" }] }] },
    descriptor: { description: "Probe widget", dataExample: { title: "Hello from WebMCP" } }
  };
  const target = tools.find((t) => t.name === "widgentic_widget_draft_load");
  const attempts = [];
  let executed = null;
  const calls = target
    ? [
        ["document.modelContext.executeTool(tool, input)", () => context.executeTool(target, { definition })],
        ["testing.executeTool(tool, input)", () => testing.executeTool(target, { definition })],
        ["testing.executeTool(name, json)", () => testing.executeTool(target.name, JSON.stringify({ definition }))],
        // Without the testing flag (origin trial), the spec surface is all there is.
        ["document.modelContext.executeTool(tool, json)", () => context.executeTool(target, JSON.stringify({ definition }))]
      ]
    : [];
  for (const [shape, call] of calls) {
    try {
      const value = await call();
      executed = { shape, value: typeof value === "string" ? value.slice(0, 400) : JSON.stringify(value).slice(0, 400) };
      break;
    } catch (error) {
      attempts.push(`${shape}: ${error?.message ?? error}`);
    }
  }
  await sleep(300);
  return {
    status,
    surface,
    toolCount: listed.length,
    testingListedCount: testingListed?.length ?? null,
    readOnlyCount: listed.filter((t) => t.readOnly).length,
    tools: listed.map((t) => t.name),
    executed,
    attempts,
    designer: {
      kindInputShowsProbe: [...document.querySelectorAll("input")].some((input) => input.value === "probe-card"),
      previewShowsTitle: document.body.innerText.includes("Hello from WebMCP")
    }
  };
})()
