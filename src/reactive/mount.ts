import type { WidgetCatalog, WidgetNode } from "../catalog/index.js";
import { createCatalog } from "../catalog/index.js";
import type { WidgetContractError } from "../contract/index.js";
import { buildDom } from "./build.js";
import { patchNode } from "./diff.js";

/** Outcome of a mount or update. Failures leave the DOM untouched. */
export type UpdateResult =
  | { ok: true }
  | { ok: false; error: WidgetContractError };

export interface MountOptions {
  /**
   * Catalog used for validation and rendering. Defaults to a fresh
   * `createCatalog()` per mount; pass a shared instance to render custom
   * registered kinds.
   */
  catalog?: WidgetCatalog;
}

export interface WidgetMount {
  /** Outcome of the initial render performed by `mountWidget`. */
  readonly initial: UpdateResult;
  /**
   * Re-render with a new payload, patching the DOM in place. Returns a
   * structured error (DOM untouched) for invalid payloads. Throws if the
   * mount was disposed — that is a host programming error.
   */
  update(payload: unknown): UpdateResult;
  /** Currently rendered tree (`undefined` before the first successful render). */
  node(): WidgetNode | undefined;
  /** Empty the container and end this mount. Idempotent. */
  dispose(): void;
}

/**
 * Mount a widget payload into `container` and keep updating it in place.
 * The first render is just an internal `update`; its outcome is exposed as
 * `initial`, so a failed first payload does not cost the caller the handle.
 */
export function mountWidget(
  payload: unknown,
  container: Element,
  options: MountOptions = {}
): WidgetMount {
  const catalog = options.catalog ?? createCatalog();
  let current: WidgetNode | undefined;
  let root: Node | undefined;
  let disposed = false;

  function update(nextPayload: unknown): UpdateResult {
    if (disposed) {
      throw new Error(
        "Widget mount is disposed; create a new mount instead of updating."
      );
    }
    const rendered = catalog.render(nextPayload);
    if (!rendered.ok) return rendered;

    if (current === undefined || root === undefined) {
      const built = buildDom(rendered.node, container.ownerDocument);
      container.replaceChildren(built);
      root = built;
    } else {
      root = patchNode(current, rendered.node, root);
    }
    current = rendered.node;
    return { ok: true };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    container.replaceChildren();
    current = undefined;
    root = undefined;
  }

  return {
    initial: update(payload),
    update,
    node: () => current,
    dispose
  };
}
