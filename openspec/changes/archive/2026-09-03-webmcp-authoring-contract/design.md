# Design

**D1 — Copy the guide, do not import it.** `@widgentic/mcp` is Node-only by rule, so the
browser package cannot import `buildAuthoringGuide`. The text is copied with the workflow
rewritten for the browser and the two store constants restated with a "keep in step"
comment. Moving the guide into a browser-safe core module would end the duplication; it is
queued in the backlog, not done under the deadline.

**D2 — Cheat sheet on every editing tool, full guide one call away.** ChatGPT reads tool
descriptions before choosing; a description that names the transforms and the style rule
changes the first draft. The full contract stays in its own read-only tool so the list
does not balloon.

**D3 — A dry-run check tool.** Iterating against the live designer disturbs what the
person sees and clears their undo history; the check tool returns the same verdict with
no side effect, so agents converge before loading.

**D4 — State the host's write path, do not fight it.** A host that can click can click
Save. The package keeps its own boundary (no save tool), tells the agent to leave Save to
the person, and the docs say what the host can do and that the draft is visible first.
Blocking automation (confirm dialogs, hidden controls) would punish the person and not
stop the agent.
