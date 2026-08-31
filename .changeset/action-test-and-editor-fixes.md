---
"@widgentic/mcp": patch
"@widgentic/designer": patch
---

Testing a standalone http action no longer applies a widget's output fold.

`testHttpAction` validated the response and then folded it with the
binding-level default (`merge`), which requires object shapes — but `mode`
and `map` belong to a WIDGET'S binding, authored later; no binding exists at
action-authoring time. An action whose API returns an array or scalar could
therefore never pass its test (and, behind a test-gated save, never be
saved). The test now validates against the action's own output schema and
hands back the redacted response; binding-time folding keeps its own
validation where the mode is actually authored.

Designer: the action editor's Kind and Method selects share one row. Secrets:
the value refusals say "characters (UTF-8 bytes)" instead of bare "bytes".
