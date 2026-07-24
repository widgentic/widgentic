## 1. Module scaffolding

- [x] 1.1 Create `src/templates/` with `index.ts` (public exports), `types.ts` (`WidgetTemplate`, `TemplateNode`, `TemplateAttrValue`, `TemplateError`), `guards.ts` (shared constants: forbidden-attr regex, URL-attr list, scheme allowlist, depth cap), `validate.ts`, and `compile.ts`
- [x] 1.2 Add `./templates` entry to `package.json` `exports`

## 2. Validation

- [x] 2.1 Implement node-shape validation for all five forms (string, bind, element, each, when) with dotted `error.path` locations
- [x] 2.2 Validate attr values (string or `{ bind }`), path strings, and reject `on*` attribute names with `FORBIDDEN_ATTRIBUTE`
- [x] 2.3 Enforce the 64-level depth cap with `TEMPLATE_TOO_DEEP`

## 3. Interpretation

- [x] 3.1 Implement path resolution: dot segments over objects/array indices from `payload.data`, `each`-item scope, `"."` self, `"$meta."` prefix; missing paths → blank/empty/falsy, never throw
- [x] 3.2 Implement `compileTemplate`: interpret text/bind/element nodes to `WidgetNode` (bind values stringified with the built-ins' discipline), flatten `each` output, select `when` branches, drop directives from output
- [x] 3.3 Enforce render-time safety in the interpreter: skip `on*` attrs, drop URL-bearing attrs with disallowed schemes (shared `guards.ts` constants)
- [x] 3.4 Implement `registerTemplate(catalog, kind, template)`: validate (throw with the structured error on failure), compile, `catalog.register`

## 4. Tests

- [x] 4.1 Validation tests: all five forms pass; malformed bind/attr/path located via `error.path`; `on*` rejected; depth cap
- [x] 4.2 Interpretation tests: bind text, bound attrs, `each` with item scope and `empty`, `when`/`else`, nested directives; every path-resolution scenario (dot, array index, `"."`, `"$meta."`, missing → blanks)
- [x] 4.3 Safety tests: skipped `onclick` when compiled unvalidated, `javascript:` href dropped vs `https:` kept, bound markup inert through `renderToHtml`
- [x] 4.4 Registration tests: `registerTemplate` round trip through `catalog.render`, duplicate kind throws `DuplicateKindError`, invalid template throws with `TemplateError`
- [x] 4.5 Reactive integration test (happy-dom, package entries): template `each` widget mounted via `widgentic/reactive`, appended record patches in place with element identity preserved
- [x] 4.6 Type tests (`types.test-d.ts`): `TemplateNode` union, `validateTemplate` narrowing, `compileTemplate` returns `WidgetRenderer`

## 5. Verification

- [x] 5.1 Run `npm run typecheck`, `npm test`, and `npm run test:types` — all green
- [x] 5.2 Confirm `widgentic/templates` resolves via package exports (import through the package entry in a test)
