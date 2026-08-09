/**
 * Designer draft store: one micro-store per designer instance — get,
 * immutable update, subscribe, and a bounded undo stack. Deliberately
 * framework-free (the "Arrow JS direction": fine-grained subscriptions,
 * no VDOM) so the designer stays a zero-dependency embeddable.
 */
import type { WidgetDescriptorInput } from "widgentic/catalog";
import type { WidgetTemplate } from "widgentic/templates";
import type { WidgetTheme } from "widgentic/theming";

/** The draft being designed — the server's `CustomWidget` shape plus session extras. */
export interface WidgetDraft {
  kind: string;
  template: WidgetTemplate;
  descriptor: WidgetDescriptorInput;
  /** Optional preview data overriding `descriptor.dataExample`. */
  sampleData?: unknown;
  /** Preview theme (also the theme-designer working copy). */
  theme?: WidgetTheme;
}

export type DraftListener = (draft: WidgetDraft) => void;

const UNDO_LIMIT = 50;

export interface DraftStore {
  get(): WidgetDraft;
  /** Replace the draft via an updater; records undo history. */
  update(updater: (draft: WidgetDraft) => WidgetDraft): void;
  /** Replace wholesale (imports/loads); clears history. */
  replace(draft: WidgetDraft): void;
  undo(): boolean;
  subscribe(listener: DraftListener): () => void;
}

/** Structured-clone with JSON semantics — drafts are serializable by contract. */
export function cloneDraft(draft: WidgetDraft): WidgetDraft {
  return JSON.parse(JSON.stringify(draft)) as WidgetDraft;
}

export function starterDraft(): WidgetDraft {
  return {
    kind: "my-widget",
    template: {
      tag: "div",
      attrs: { class: "wg-template" },
      children: [{ tag: "h2", children: [{ bind: "$meta.title" }] }, { bind: "message" }]
    },
    descriptor: {
      description: "Describe what this widget is for.",
      dataShape: "A plain object with a `message` string.",
      dataExample: { message: "Hello from the widgentic designer" }
    }
  };
}

export function createDraftStore(initial?: WidgetDraft): DraftStore {
  let current = cloneDraft(initial ?? starterDraft());
  const history: WidgetDraft[] = [];
  const listeners = new Set<DraftListener>();

  function notify(): void {
    for (const listener of [...listeners]) listener(current);
  }

  return {
    get: () => current,
    update(updater) {
      history.push(current);
      if (history.length > UNDO_LIMIT) history.shift();
      current = cloneDraft(updater(cloneDraft(current)));
      notify();
    },
    replace(draft) {
      history.length = 0;
      current = cloneDraft(draft);
      notify();
    },
    undo() {
      const previous = history.pop();
      if (previous === undefined) return false;
      current = previous;
      notify();
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
