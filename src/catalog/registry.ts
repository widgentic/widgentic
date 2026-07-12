import { validateWidgetPayload } from "../contract/validate.js";
import type { WidgetContractError } from "../contract/errors.js";
import type { WidgetKind } from "../contract/types.js";
import type { WidgetNode, WidgetRenderer } from "./node.js";
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
  /** Register a renderer for a new kind. Throws {@link DuplicateKindError} on duplicates (built-ins included). */
  register(kind: WidgetKind, renderer: WidgetRenderer): void;
  has(kind: WidgetKind): boolean;
  resolve(kind: WidgetKind): WidgetRenderer | undefined;
  /** Currently registered kinds, as a fresh array. */
  kinds(): WidgetKind[];
  /** Validate a payload against the contract (with this catalog's kinds) and render it. Never throws. */
  render(payload: unknown): RenderResult;
}

/**
 * Create an independent catalog instance with the built-ins (`card`,
 * `table`, `tree`, `custom`) pre-registered.
 */
export function createCatalog(): WidgetCatalog {
  const renderers = new Map<WidgetKind, WidgetRenderer>();

  const catalog: WidgetCatalog = {
    register(kind, renderer) {
      if (renderers.has(kind)) throw new DuplicateKindError(kind);
      renderers.set(kind, renderer);
    },
    has: (kind) => renderers.has(kind),
    resolve: (kind) => renderers.get(kind),
    kinds: () => [...renderers.keys()],
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
  catalog.register("card", renderCard);
  catalog.register("table", renderTable);
  catalog.register("tree", renderTree);
  catalog.register("custom", renderCustom);

  return catalog;
}
