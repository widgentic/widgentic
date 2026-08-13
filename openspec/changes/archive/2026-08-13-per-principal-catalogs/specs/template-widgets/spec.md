# template-widgets — Delta: bounded interpretation

## MODIFIED Requirements

### Requirement: Template module programmatic surface
The package SHALL export from a `./templates` entry: `validateTemplate(input: unknown)`, `compileTemplate(template: WidgetTemplate, options?: { maxNodes?: number }): WidgetRenderer`, `registerTemplate(catalog: WidgetCatalog, kind: string, template: unknown, descriptor?, options?): void`, `countTemplateNodes(template)`, `DEFAULT_MAX_NODES`, and the `WidgetTemplate`/`TemplateNode`/`TemplateError` types. Templates SHALL be JSON-serializable plain data with no functions.

#### Scenario: Compiled template is an ordinary renderer
- **WHEN** `compileTemplate` output is registered via `catalog.register` and a payload of that kind is rendered
- **THEN** `catalog.render` SHALL return `{ ok: true, node }` produced by interpreting the template

#### Scenario: registerTemplate validates then registers
- **WHEN** `registerTemplate(catalog, "invoice", <valid template>)` is called
- **THEN** the kind SHALL render through the catalog
- **AND** calling it again with the same kind SHALL throw the catalog's `DuplicateKindError`

#### Scenario: registerTemplate rejects invalid templates loudly
- **WHEN** `registerTemplate(catalog, "bad", { bind: 42 })` is called
- **THEN** the call SHALL throw an error carrying the structured `TemplateError`

#### Scenario: Node counting is available for storage limits
- **WHEN** `countTemplateNodes(template)` is called on a template with nested `each`/`when` branches
- **THEN** it SHALL return the number of template nodes (structure, not rendered output) so stores can enforce a size limit before persisting

## ADDED Requirements

### Requirement: Bounded interpretation
Interpretation SHALL be bounded by a node budget (`options.maxNodes`, default `DEFAULT_MAX_NODES` = 50 000). Template size alone bounds nothing, because `each` multiplies template nodes by agent-supplied data length; a stored template driven by a large payload must not be able to spend the process. When the budget is exhausted, interpretation SHALL stop, return the nodes built so far, and mark the render as truncated so the outcome is visible rather than silent. The bound SHALL be deterministic (node count, not wall-clock), so the same template and data always produce the same result.

#### Scenario: A runaway each is stopped at the budget
- **WHEN** a template whose `each` iterates 1 000 000 items is compiled with `maxNodes: 1000` and rendered
- **THEN** the render SHALL complete promptly, contain at most the budgeted nodes, and be marked truncated

#### Scenario: Ordinary renders are unaffected and unmarked
- **WHEN** a template producing far fewer nodes than the budget is rendered
- **THEN** the output SHALL be identical to the unbounded result and SHALL NOT be marked truncated

#### Scenario: The bound is deterministic
- **WHEN** the same over-budget template and data are rendered twice
- **THEN** both renders SHALL produce byte-identical output
