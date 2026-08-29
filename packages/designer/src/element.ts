/**
 * Opt-in custom element wrapping the factory. Registration only ever
 * happens through the explicit call — importing this module has no
 * custom-element registry side effects, so hosts stay in control.
 */
import { createDesigner } from "./shell.js";
import type { DesignerHandle } from "./shell.js";
import { createSchemaDesigner } from "./schema-designer.js";
import type { SchemaDesignerHandle } from "./schema-designer.js";
import { createThemeDesigner } from "./theme-designer.js";
import type { ThemeDesignerHandle } from "./theme-designer.js";
import { createActionDesigner } from "./action-designer.js";
import type { ActionDesignerHandle } from "./action-designer.js";
import { parseChromeAttribute } from "./dom.js";
import type { ChromeOptions } from "./dom.js";

/**
 * The attributes every designer element shares, read once at connect:
 * `appearance` pins the chrome scheme, `chrome` (JSON) hands over the
 * host's chrome tokens. Anything invalid is ignored, never thrown.
 */
function elementOptions(
  element: Element
): { appearance?: "light" | "dark"; chrome?: ChromeOptions } {
  const appearance = element.getAttribute("appearance");
  const chrome = parseChromeAttribute(element.getAttribute("chrome"));
  return {
    ...(appearance === "light" || appearance === "dark" ? { appearance } : {}),
    ...(chrome === undefined ? {} : { chrome })
  };
}

export const DEFAULT_TAG = "widgentic-designer";
export const DEFAULT_THEME_TAG = "widgentic-theme-designer";
export const DEFAULT_SCHEMA_TAG = "widgentic-schema-designer";
export const DEFAULT_ACTION_TAG = "widgentic-action-designer";

export function defineDesignerElement(tagName: string = DEFAULT_TAG): void {
  if (customElements.get(tagName) !== undefined) return;

  class WidgenticDesignerElement extends HTMLElement {
    #handle: DesignerHandle | undefined;
    #unsubscribe: (() => void) | undefined;

    connectedCallback(): void {
      if (this.#handle !== undefined) return;
      this.#handle = createDesigner(this, elementOptions(this));
      this.#unsubscribe = this.#handle.subscribe((draft, diagnostics) => {
        this.dispatchEvent(
          new CustomEvent("widgentic-change", {
            detail: { draft, diagnostics },
            bubbles: true
          })
        );
      });
    }

    disconnectedCallback(): void {
      this.#unsubscribe?.();
      this.#handle?.dispose();
      this.#handle = undefined;
      this.#unsubscribe = undefined;
    }

    /** The embedding host's programmatic access to the wrapped handle. */
    get designer(): DesignerHandle | undefined {
      return this.#handle;
    }
  }

  customElements.define(tagName, WidgenticDesignerElement);
}

/** Sibling registrar for the standalone theme designer. */
export function defineThemeDesignerElement(tagName: string = DEFAULT_THEME_TAG): void {
  if (customElements.get(tagName) !== undefined) return;

  class WidgenticThemeDesignerElement extends HTMLElement {
    #handle: ThemeDesignerHandle | undefined;
    #unsubscribe: (() => void) | undefined;

    connectedCallback(): void {
      if (this.#handle !== undefined) return;
      this.#handle = createThemeDesigner(this, elementOptions(this));
      this.#unsubscribe = this.#handle.subscribe((entry) => {
        this.dispatchEvent(
          new CustomEvent("widgentic-change", { detail: { theme: entry }, bubbles: true })
        );
      });
    }

    disconnectedCallback(): void {
      this.#unsubscribe?.();
      this.#handle?.dispose();
      this.#handle = undefined;
      this.#unsubscribe = undefined;
    }

    get designer(): ThemeDesignerHandle | undefined {
      return this.#handle;
    }
  }

  customElements.define(tagName, WidgenticThemeDesignerElement);
}

/** Sibling registrar for the standalone schema designer. */
export function defineSchemaDesignerElement(tagName: string = DEFAULT_SCHEMA_TAG): void {
  if (customElements.get(tagName) !== undefined) return;

  class WidgenticSchemaDesignerElement extends HTMLElement {
    #handle: SchemaDesignerHandle | undefined;
    #unsubscribe: (() => void) | undefined;

    connectedCallback(): void {
      if (this.#handle !== undefined) return;
      this.#handle = createSchemaDesigner(this, elementOptions(this));
      this.#unsubscribe = this.#handle.subscribe((entry) => {
        this.dispatchEvent(
          new CustomEvent("widgentic-change", { detail: { schema: entry }, bubbles: true })
        );
      });
    }

    disconnectedCallback(): void {
      this.#unsubscribe?.();
      this.#handle?.dispose();
      this.#handle = undefined;
      this.#unsubscribe = undefined;
    }

    get designer(): SchemaDesignerHandle | undefined {
      return this.#handle;
    }
  }

  customElements.define(tagName, WidgenticSchemaDesignerElement);
}

/** Sibling registrar for the standalone action designer. */
export function defineActionDesignerElement(tagName: string = DEFAULT_ACTION_TAG): void {
  if (customElements.get(tagName) !== undefined) return;

  class WidgenticActionDesignerElement extends HTMLElement {
    #handle: ActionDesignerHandle | undefined;
    #unsubscribe: (() => void) | undefined;

    connectedCallback(): void {
      if (this.#handle !== undefined) return;
      this.#handle = createActionDesigner(this, elementOptions(this));
      this.#unsubscribe = this.#handle.subscribe((entry) => {
        this.dispatchEvent(
          new CustomEvent("widgentic-change", { detail: { action: entry }, bubbles: true })
        );
      });
    }

    disconnectedCallback(): void {
      this.#unsubscribe?.();
      this.#handle?.dispose();
      this.#handle = undefined;
      this.#unsubscribe = undefined;
    }

    get designer(): ActionDesignerHandle | undefined {
      return this.#handle;
    }
  }

  customElements.define(tagName, WidgenticActionDesignerElement);
}
