import { validateWidgetPayload } from "../contract/validate.js";
import type { WidgetContractError } from "../contract/errors.js";
import type { WidgetKind } from "../contract/types.js";
import type { WidgetNode, WidgetRenderer } from "./node.js";
import type { WidgetDescriptor, WidgetDescriptorInput } from "./descriptors.js";
import { BUILTIN_DESCRIPTORS } from "./descriptors.js";
import { validateDataAgainstSchema } from "./schema.js";
import { renderCard } from "./widgets/card.js";
import { renderTable } from "./widgets/table.js";
import { renderTree } from "./widgets/tree.js";
import { renderCustom } from "./widgets/custom.js";
import { checkGroupEnvelope, renderGroupContainer } from "./widgets/group.js";

/**
 * Group composition: an item's action descriptors were compiled against
 * the ITEM's template, so they name the item's kind (`widget`) but not
 * where the item sits in the group payload. Stamping `at` lets the server
 * fold an action's result back into the right item and re-render the whole
 * group. Returns a NEW tree — renderers may hand back cached nodes, and
 * composition must not mutate what a pure renderer returned. Groups do not
 * nest, so the location is always one level: `data.items.<i>`.
 */
function stampActionLocation(node: WidgetNode, location: string): WidgetNode {
  if (typeof node === "string") return node;
  const raw = node.attrs?.["data-wg-action"];
  let attrs = node.attrs;
  if (typeof raw === "string") {
    try {
      const descriptor = JSON.parse(raw) as Record<string, unknown>;
      if (typeof descriptor === "object" && descriptor !== null) {
        attrs = { ...node.attrs, "data-wg-action": JSON.stringify({ ...descriptor, at: location }) };
      }
    } catch {
      /* not a descriptor */
    }
  }
  const children = node.children?.map((child) => stampActionLocation(child, location));
  return {
    tag: node.tag,
    ...(attrs !== undefined ? { attrs } : {}),
    ...(children !== undefined ? { children } : {})
  };
}

/**
 * Thrown when a widget kind is registered twice on the same catalog.
 * Double registration is a host programming error, surfaced loudly at
 * setup time — unlike render-time errors, which are structured results.
 */
export class DuplicateKindError extends Error {
  readonly code: "DUPLICATE_KIND" = "DUPLICATE_KIND";
  readonly kind: string;

  constructor(kind: string) {
    super(`Widget kind '${kind}' is already registered.`);
    this.name = "DuplicateKindError";
    this.kind = kind;
  }
}

/** Discriminated result of `catalog.render` (mirrors the contract pattern). */
export type RenderResult =
  | { ok: true; node: WidgetNode }
  | { ok: false; error: WidgetContractError };

export interface WidgetCatalog {
  /**
   * Register a renderer for a new kind, optionally with agent-facing
   * documentation. Throws {@link DuplicateKindError} on duplicates
   * (built-ins included). Without a descriptor, a minimal one is generated
   * so every renderable kind stays listable.
   */
  register(
    kind: WidgetKind,
    renderer: WidgetRenderer,
    descriptor?: WidgetDescriptorInput
  ): void;
  has(kind: WidgetKind): boolean;
  resolve(kind: WidgetKind): WidgetRenderer | undefined;
  /** Currently registered kinds, as a fresh array. */
  kinds(): WidgetKind[];
  /** Descriptor for a kind, or undefined when the kind is unknown. */
  describe(kind: WidgetKind): WidgetDescriptor | undefined;
  /** All descriptors, as a fresh array. */
  list(): WidgetDescriptor[];
  /** Validate a payload against the contract (with this catalog's kinds) and render it. Never throws. */
  render(payload: unknown): RenderResult;
}

/**
 * Create an independent catalog instance with the built-ins (`card`,
 * `table`, `tree`, `custom`) pre-registered.
 */
export function createCatalog(): WidgetCatalog {
  const renderers = new Map<WidgetKind, WidgetRenderer>();
  const descriptors = new Map<WidgetKind, WidgetDescriptor>();

  const catalog: WidgetCatalog = {
    register(kind, renderer, descriptor) {
      if (renderers.has(kind)) throw new DuplicateKindError(kind);
      renderers.set(kind, renderer);
      descriptors.set(kind, {
        kind,
        description: descriptor?.description ?? `Custom widget kind '${kind}'.`,
        dataShape: descriptor?.dataShape ?? "Defined by the registered renderer.",
        ...(descriptor?.dataExample !== undefined
          ? { dataExample: descriptor.dataExample }
          : {}),
        ...(descriptor?.hints ? { hints: descriptor.hints } : {}),
        ...(descriptor?.dataSchema ? { dataSchema: descriptor.dataSchema } : {}),
        ...(descriptor?.styles ? { styles: descriptor.styles } : {})
      });
    },
    has: (kind) => renderers.has(kind),
    resolve: (kind) => renderers.get(kind),
    kinds: () => [...renderers.keys()],
    describe: (kind) => descriptors.get(kind),
    list: () => [...descriptors.values()],
    render(payload) {
      const validated = validateWidgetPayload(payload, {
        knownKinds: new Set(renderers.keys())
      });
      if (!validated.ok) return validated;
      // Opt-in structural validation: kinds with a dataSchema fail fast
      // with a dotted data path instead of rendering a lenient fallback.
      const schema = descriptors.get(validated.payload.kind)?.dataSchema;
      if (schema) {
        const schemaError = validateDataAgainstSchema(
          schema,
          validated.payload.data
        );
        if (schemaError) return { ok: false, error: schemaError };
      }
      // `group` recurses through this same entry so registered and
      // composed kinds participate and per-item failures keep their
      // structured codes, re-pathed under `data.items[<i>]`. Renderers
      // stay pure `(payload) => WidgetNode`; composition is dispatch work.
      if (validated.payload.kind === "group") {
        const envelope = checkGroupEnvelope(validated.payload.data);
        if (!envelope.ok) return envelope;
        const children: WidgetNode[] = [];
        for (let i = 0; i < envelope.items.length; i++) {
          const item = envelope.items[i]!;
          const sub = catalog.render({
            kind: item.kind,
            data: item.data,
            ...(item.hints !== undefined ? { hints: item.hints } : {}),
            ...(item.meta !== undefined ? { meta: item.meta } : {})
          });
          if (!sub.ok) {
            const subPath = sub.error.path;
            return {
              ok: false,
              error: {
                ...sub.error,
                path: `data.items[${i}]${subPath ? `.${subPath}` : ""}`
              }
            };
          }
          children.push(stampActionLocation(sub.node, `data.items.${i}`));
        }
        return {
          ok: true,
          node: renderGroupContainer(validated.payload.hints, children)
        };
      }
      const renderer = renderers.get(validated.payload.kind);
      if (renderer === undefined) {
        // Unreachable while knownKinds is non-empty; kept for totality.
        return {
          ok: false,
          error: {
            code: "UNKNOWN_KIND",
            path: "kind",
            message: `Unknown widget kind '${validated.payload.kind}'.`
          }
        };
      }
      // Built-ins are total by construction; this guards the extension
      // point — a registered renderer that throws must surface as a
      // structured error, never a propagated exception.
      try {
        return { ok: true, node: renderer(validated.payload) };
      } catch (thrown) {
        return {
          ok: false,
          error: {
            code: "RENDER_FAILED",
            path: "widget",
            message: `Renderer for kind '${validated.payload.kind}' threw: ${
              thrown instanceof Error ? thrown.message : String(thrown)
            }`
          }
        };
      }
    }
  };

  // Built-ins go through register() so they get the same duplicate
  // protection and hosts cannot silently override them.
  catalog.register("card", renderCard, BUILTIN_DESCRIPTORS.card);
  catalog.register("table", renderTable, BUILTIN_DESCRIPTORS.table);
  catalog.register("tree", renderTree, BUILTIN_DESCRIPTORS.tree);
  catalog.register("custom", renderCustom, BUILTIN_DESCRIPTORS.custom);
  // `render()` intercepts 'group' before renderer lookup, so this renderer
  // only serves direct `resolve()` callers (e.g. designer previews); it
  // delegates back through the dispatch so items render for them too.
  catalog.register(
    "group",
    (payload) => {
      const result = catalog.render(payload);
      if (result.ok) return result.node;
      throw new Error(result.error.message);
    },
    BUILTIN_DESCRIPTORS.group
  );

  return catalog;
}
