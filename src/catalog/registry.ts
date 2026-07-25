import { validateWidgetPayload } from "../contract/validate.js";
import type { WidgetContractError } from "../contract/errors.js";
import type { WidgetKind } from "../contract/types.js";
import type { WidgetNode, WidgetRenderer } from "./node.js";
import type { WidgetDescriptor, WidgetDescriptorInput } from "./descriptors.js";
import { BUILTIN_DESCRIPTORS } from "./descriptors.js";
import { renderCard } from "./widgets/card.js";
import { renderTable } from "./widgets/table.js";
import { renderTree } from "./widgets/tree.js";
import { renderCustom } from "./widgets/custom.js";

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
        ...(descriptor?.hints ? { hints: descriptor.hints } : {})
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
      return { ok: true, node: renderer(validated.payload) };
    }
  };

  // Built-ins go through register() so they get the same duplicate
  // protection and hosts cannot silently override them.
  catalog.register("card", renderCard, BUILTIN_DESCRIPTORS.card);
  catalog.register("table", renderTable, BUILTIN_DESCRIPTORS.table);
  catalog.register("tree", renderTree, BUILTIN_DESCRIPTORS.tree);
  catalog.register("custom", renderCustom, BUILTIN_DESCRIPTORS.custom);

  return catalog;
}
