# Design — template bind transforms

## D1. Transforms, not expressions

Both walls could be broken with a template expression language — and
that is the one door this DSL must never open: it is authored by
untrusted users and interpreted server-side. The two transforms are
finite, serializable, and inspectable:

- `map` is a lookup table. Data selects a key; every character that can
  reach the output was written by the author. A hostile `status` value
  selects nothing worse than `default` (or empty).
- `prefix` is one authored literal glued to one bound value, and the
  composition still runs the existing URL guard, so the safety analysis
  of a prefixed attr is identical to a plain bound attr.

`when`-equality (`{ when: { path, equals } }`) was considered and set
aside: it solves the class case only by duplicating whole elements per
status value, which is the workaround pain that motivated this change.
`map` addresses the need at the right altitude. If node-level equality
ever earns its place, it is additive.

## D2. Mutually exclusive in v1

`{ bind, map, prefix }` composes coherently (resolve → map → prefix),
but there is no motivating case, and every allowed combination must be
taught in the guide, drawn in the designer, and validated forever.
Rejecting the pair keeps the semantics one sentence each. Relaxing
later is additive; restricting later is breaking.

## D3. Emptiness rules do the UX work

- `map` miss without `default` → empty value: a status the author did
  not anticipate degrades to an unstyled pill, never a broken class.
- `prefix` with an empty/missing bound value → empty value, prefix
  withheld: no `href="mailto:"` dead links. This asymmetry (map may
  emit on miss via `default`; prefix never emits alone) follows from
  what each is for.

## D4. Where the work lands

Resolution happens at template interpretation, so the transforms are
invisible downstream — `WidgetNode`, the serializer, the app template,
and the reactive mounter see plain attribute strings. The blast radius
is: `src/templates` (types, validator, interpreter), the designer's
attr row, and the guide.

## D5. The designer reuses the flat idioms

A bind-mode attr row gains a `prefix` text input and a map editor built
on the existing record-row idiom (`createRecordEditor`'s shape): key →
literal rows plus a `default`. No new interaction grammar; transforms
render inside the attr group's dotted rail.

## D6. Ordering constraint

The widget-designer and mcp-server deltas here are built ON TOP of the
pending `shared-data-schemas` delta text for the same requirements.
**Archive `shared-data-schemas` before applying the sync of this
change** — archiving in the other order would regress that change's
requirement text.

## Risks

- **Map values are classes but not only classes** — `map` works on any
  attr. That is deliberate (e.g. mapping a status to a `title` string),
  and safe by the same argument: outputs are authored literals.
- **The guide-simulation fixture must grow** to use both transforms, or
  guide drift on these forms goes uncaught — the fixture is the contract
  test for "an agent following only the guide succeeds".
- **Designer round-trip**: attr rows must not lose transform fields when
  the mode select or name changes; tests pin load → edit → export.
