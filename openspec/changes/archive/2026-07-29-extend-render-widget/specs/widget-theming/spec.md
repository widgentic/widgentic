## MODIFIED Requirements

### Requirement: Theme validation
`validateTheme(input)` SHALL return `{ ok: true, theme } | { ok: false, error: ThemeError }` where `ThemeError` has `code` (`"INVALID_THEME" | "UNKNOWN_TOKEN" | "INVALID_TOKEN_VALUE"`), `message`, and the offending `token` name when applicable. Non-object input SHALL fail with `INVALID_THEME`; keys outside `THEME_TOKENS` SHALL fail with `UNKNOWN_TOKEN`; values that are not strings or that contain `;`, `{`, `}`, `<`, `>`, `url(`, or `expression(` (case-insensitive, whitespace-tolerant before the parenthesis) SHALL fail with `INVALID_TOKEN_VALUE`. The guard rejects exfiltration and execution vectors, not invalid CSS — inert nonsense values pass.

#### Scenario: Valid theme passes
- **WHEN** `validateTheme({ bg: "#0b0e14", "font-family": "Inter, sans-serif" })` is called
- **THEN** the result SHALL be ok

#### Scenario: Unknown token is rejected
- **WHEN** `validateTheme({ sneaky: "red" })` is called
- **THEN** the result SHALL have `error.code: "UNKNOWN_TOKEN"` and `error.token: "sneaky"`

#### Scenario: Injection-shaped values are rejected
- **WHEN** a value contains `"red; } body { display:none"` or `"url(https://evil.example/x)"`
- **THEN** the result SHALL have `error.code: "INVALID_TOKEN_VALUE"`

#### Scenario: Legacy script vectors are rejected
- **WHEN** a value contains `"expression(alert(1))"` or `"EXPRESSION (alert(1))"`
- **THEN** the result SHALL have `error.code: "INVALID_TOKEN_VALUE"`
