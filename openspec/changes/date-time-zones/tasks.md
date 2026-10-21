## 1. Host probe (before implementation)

- [x] 1.1 Create a never-merged branch `feature/date-time-zones-probe` from this change's base. The app template shows one status line in the frame: the host context's `timeZone` (or "none") and the frame's default zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Stage it. Done: `e4d7b28` (local only) also shows the host `locale` and the frame's clock. Staged as `date-time-zones-probe-e4d7b28` (ACR cj40, revision `--0000035`), and the served template carries the probe.
- [x] 1.2 Owner leg: render any widget in a fresh chat in claude.ai, ChatGPT and VS Code Copilot, and report the status line for each. Record the results in design D6, then restore staging with this change's own image in task 6. Done 2026-10-21:
  - claude.ai and ChatGPT send `timeZone="America/Bogota"`;
  - Copilot sends none;
  - every frame's own zone is `America/Bogota` (GMT-0500).

## 2. The format (`@widgentic/core`)

- [x] 2.1 `value-format.ts`:
  - export `DATE_ZONES` and `DATE_ZONE_RULE` (D8);
  - `DateFormatSpec` gains `zone?`, and `parseFormatSpec` keeps a valid one;
  - an instant-and-offset parse sits beside `toEpochMillis` (D2);
  - `formatDate` reads `instant + offset` for `value`.
- [x] 2.2 `compile.ts`: a TEXT bind with `zone: "viewer"` and a parseable value emits the `time` element with `datetime` and `data-wg-date` and the UTC text. An unparseable value stays plain text (D3).
- [x] 2.3 `validate.ts`: `checkFormat` refuses an unknown `zone`, and refuses `viewer` on an attribute value, with messages derived from `DATE_ZONES` (D4).
- [x] 2.4 Tests:
  - the three new "Template node forms and interpretation" scenarios, with the existing date scenarios unchanged;
  - unit cases for the value-offset parse: `Z`, `±HH:MM`, `±HHMM`, unzoned, date-only, epoch seconds and milliseconds, a fraction;
  - the exports snapshot.

## 3. The bridge (`@widgentic/mcp`)

- [x] 3.1 `app-template.ts`:
  - `zoneOf(ctx)` and the stored zone in `applyHostContext` (D6);
  - `zoned(tree)` and the token formatter (D5);
  - `mountResult` and `mountPreviewTree` keep the raw tree and mount its zoned copy;
  - a zone change re-mounts through `patch`.

  Keep the served script comment-free and backtick-free.
- [x] 3.2 Raise the raw budget to 46,080 in `app-template-size.test.ts` (D7), and record the measured size. Measured: 46,072 raw (8 B left) and 12,213 gzipped. Getting there took some tightening: `zoneOf` lets `Intl` resolve a missing zone, `mountTree` serves results and previews, and `rezone` keys on the attached root.
- [x] 3.3 Tests through `bootTemplate()`, one per "The frame shows viewer-zone dates in the viewer's zone" scenario:
  - the host zone (`Asia/Tokyo` → `01:30`);
  - no zone, and `Mars/Base` (the frame default, computed in the test);
  - a zone change (`America/New_York` → `12:30`, the same node);
  - a server preview localized;
  - an action re-render patched without phantom changes.

## 4. Steering and the designer

- [x] 4.1 Both guides' `FORMAT` line derives the zone clause from `DATE_ZONES`/`DATE_ZONE_RULE`, and both guide tests assert it.
- [x] 4.2 `template-panel.ts`: the date format's zone select (D9). Viewer appears on text rows only, and choosing UTC omits `zone`. The test covers the new widget-designer scenario.
- [x] 4.3 Corpus cases:
  - `value` with an offset, unzoned and epoch;
  - `viewer` on a text bind, with the tree, HTML and page outputs;
  - an unparseable `viewer` value;
  - the attribute refusal.

  Run `npm run conformance:generate`. Done as `corpus-dates`: a text bind in each zone plus a `value`-zone `title`, over an offset, an unzoned value, an epoch and `soon`, and a `page` render. The attribute refusal is not a corpus case, because the generator requires the corpus configuration to compose cleanly. Core's `date-zones.test.ts` covers it.

## 5. Docs, seed and release notes

- [x] 5.1 `docs/design/template-dsl.mdx`: the date format's zones and where `viewer` applies. Regenerate the reference pages.
- [x] 5.2 Demo seed: the agenda's `startsAt`/`endsAt` use `zone: "viewer"` and its example values carry an offset. The inbox's `receivedAt` uses `zone: "value"` with an offset example. Update the seed tests and regenerate the .NET sample seed.
- [x] 5.3 Changesets: `@widgentic/core`, `@widgentic/designer` and `@widgentic/mcp` minor, and `@widgentic/webmcp` patch. Add a dated `TESTING.md` entry.

## 6. Gates and staging

- [x] 6.1 Run the gates: typecheck, `npm test`, build, `pack:check`, `docs:check`, `openspec validate --strict date-time-zones` and `--specs`, and `dotnet test`.
- [x] 6.2 Deploy the branch to staging and check from the served bytes. Staging now runs `date-time-zones-a853bb4` (ACR cj41, revision `--0000036`), replacing the probe. Checked:
  - a keyed render of the seeded agenda carries `time` elements with `datetime` and `data-wg-date`;
  - the inbox shows the value's own offset time;
  - the served template carries the localizing bridge.

  Result: a keyed render of the agenda example carries 4 `time` elements (for example `datetime="2026-09-03T14:15:30.000Z"` over UTC text `2026-09-03 14:15`) in both the tree and the HTML. The inbox shows `09:15` and `08:30` as written. The template carries `zonedText` and `rezone`, and no probe.
- [ ] 6.3 Owner leg, in a fresh chat on each host:
  - the agenda's times show in the viewer's local time;
  - the inbox shows the times as the values state them;
  - the designer island preview shows the local time.
