## 1. Definitions and the Node assembly

- [x] 1.1 `definitions.ts`: add an exported `McpToolAnnotations` type and an optional `annotations` on `McpToolDefinition`, and set all four hints on every shipped definition per design D2. Update the `tools/exports.test.ts` snapshot if the type export adds a name.
- [x] 1.2 `server.ts`: register every tool with `annotations: definition.annotations`, in both `registerTool` and `registerAppTool`.
- [x] 1.3 Tests:
  - every definition carries all four hints, with the D2 values (only `execute_action` writes);
  - over the SDK, `tools/list` annotations deep-equal the definitions';
  - the host bundle's `definitions()` carries them.

## 2. Widgentic.Mcp

- [x] 2.1 `WidgenticTool`: read `annotations` from the bundle definition into `Tool.Annotations` (`ToolAnnotations`), restating no value.
- [x] 2.2 A `ProtocolTests` case: every listed widgentic tool's annotations equal the bundle's definition, and `list_widgets` is read-only, non-destructive, idempotent and closed-world.
- [x] 2.3 `CHANGELOG.md`: an Unreleased entry for 0.11.1 (dated at release, after the pin bump).

## 3. Docs and release notes

- [x] 3.1 The generated MCP tools reference shows each tool's hints (`tools/docs-generate.ts`). Regenerate it.
- [x] 3.2 Add a changeset: `@widgentic/mcp` patch (design D3).
- [x] 3.3 Add a dated `TESTING.md` verification-log entry.

## 4. Gates and staging

- [x] 4.1 Run typecheck, `npm test`, build, `pack:check`, `openspec validate --strict tool-annotations` and `--specs`, then `dotnet test`.
- [x] 4.2 Deploy the branch to staging and check from the served bytes that `tools/list` carries the annotations.

## 5. Release (after merge to main, on the owner's word)

- [x] 5.1 Publish `@widgentic/mcp` 0.11.1 through the Version Packages PR.
- [x] 5.2 Bump `WidgenticMcpVersion` and `Widgentic.Mcp` to 0.11.1, date the CHANGELOG, and run `release-dotnet.yml`.
