import type { WidgetCatalog, WidgetNode } from "../catalog/index.js";
import { createCatalog } from "../catalog/index.js";
import type { WidgetContractError } from "../contract/index.js";
import type { ActionDescriptor } from "../actions/index.js";
import { buildDom } from "./build.js";
import { patchNode } from "./diff.js";

/** Outcome of a mount or update. Failures leave the DOM untouched. */
export type UpdateResult =
  | { ok: true }
  | { ok: false; error: WidgetContractError };

/** An activated element's descriptor, handed to the host untouched. */
export type ActionActivation = ActionDescriptor;

export interface MountOptions {
  /**
   * Catalog used for validation and rendering. Defaults to a fresh
   * `createCatalog()` per mount; pass a shared instance to render custom
   * registered kinds.
   */
  catalog?: WidgetCatalog;
  /**
   * Receives activations of mounted `[data-wg-action]` elements (click, or
   * Enter/Space on non-button hosts) with the parsed descriptor and the
   * currently mounted payload; the default action is prevented. Without
   * it, action elements are inert — the mount never executes anything.
   */
  onAction?: (activation: ActionActivation, payload: unknown) => void;
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
  let mountedPayload: unknown;

  // Delegated on the container: descriptors are data the host decides
  // about — this layer only parses and forwards them.
  const onAction = options.onAction;
  function parseDescriptor(el: Element): ActionDescriptor | undefined {
    try {
      const parsed = JSON.parse(el.getAttribute("data-wg-action") ?? "") as unknown;
      if (typeof parsed === "object" && parsed !== null && typeof (parsed as { id?: unknown }).id === "string") {
        return parsed as ActionDescriptor;
      }
    } catch {
      /* malformed descriptor: inert */
    }
    return undefined;
  }
  function activation(event: Event): void {
    const target = event.target as Element | null;
    const el = target?.closest?.("[data-wg-action]");
    if (!el || !container.contains(el)) return;
    if (event.type === "keydown") {
      const key = (event as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") return;
      if (el.tagName === "BUTTON" || el.tagName === "A") return; // native keyboard → click
    }
    event.preventDefault();
    if (onAction === undefined) return;
    const descriptor = parseDescriptor(el);
    if (descriptor !== undefined) onAction(descriptor, mountedPayload);
  }
  container.addEventListener("click", activation);
  container.addEventListener("keydown", activation);

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
    mountedPayload = nextPayload;
    return { ok: true };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    container.removeEventListener("click", activation);
    container.removeEventListener("keydown", activation);
    container.replaceChildren();
    current = undefined;
    root = undefined;
    mountedPayload = undefined;
  }

  return {
    initial: update(payload),
    update,
    node: () => current,
    dispose
  };
}
