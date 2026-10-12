/**
 * The designer mount discipline, shared by the example hosts — the wiring a
 * reader copies wrong when it is copied by hand: dispose the previous
 * handle, clear the host element, construct fresh. (And remember the rule
 * these helpers exist to serve: re-mount the WIDGET designer when returning
 * to its tab, so themes saved meanwhile appear in its preview selector.)
 *
 * Deliberately not a workbench: options, persistence and seeds stay at each
 * example's call site, because that is what a reader came to read. No
 * `chrome` is passed anywhere — the designers' default IS the product
 * palette, and a page that wants to match it derives its own properties from
 * `chromeCss(CHROME_DEFAULTS)`.
 */
import { createThemeRegistry } from "@widgentic/core";
import type { ThemeEntry } from "@widgentic/core";
import {
  createActionDesigner,
  createDesigner,
  createSchemaDesigner,
  createSettingsDesigner,
  createThemeDesigner
} from "@widgentic/designer";
import type {
  ActionDesignerHandle,
  ActionDesignerOptions,
  DesignerHandle,
  DesignerOptions,
  SchemaDesignerHandle,
  SchemaDesignerOptions,
  SettingsDesignerHandle,
  SettingsDesignerOptions,
  ThemeDesignerHandle,
  ThemeDesignerOptions
} from "@widgentic/designer";

function clear(host: HTMLElement, previous: { dispose(): void } | undefined): void {
  previous?.dispose();
  host.replaceChildren();
}

export function mountWidget(
  host: HTMLElement,
  previous: DesignerHandle | undefined,
  options: DesignerOptions = {}
): DesignerHandle {
  clear(host, previous);
  return createDesigner(host, options);
}

export function mountTheme(
  host: HTMLElement,
  previous: ThemeDesignerHandle | undefined,
  options: ThemeDesignerOptions = {}
): ThemeDesignerHandle {
  clear(host, previous);
  return createThemeDesigner(host, options);
}

export function mountSchema(
  host: HTMLElement,
  previous: SchemaDesignerHandle | undefined,
  options: SchemaDesignerOptions = {}
): SchemaDesignerHandle {
  clear(host, previous);
  return createSchemaDesigner(host, options);
}

export function mountSettings(
  host: HTMLElement,
  previous: SettingsDesignerHandle | undefined,
  options: SettingsDesignerOptions = {}
): SettingsDesignerHandle {
  clear(host, previous);
  return createSettingsDesigner(host, options);
}

export function mountAction(
  host: HTMLElement,
  previous: ActionDesignerHandle | undefined,
  options: ActionDesignerOptions = {}
): ActionDesignerHandle {
  clear(host, previous);
  return createActionDesigner(host, options);
}

/**
 * Built-in themes merged with a host's saved ones for the widget designer's
 * preview selector — built-ins win a name collision, since stored themes may
 * never shadow them. One home for the merge rule, so the example hosts
 * cannot drift on it.
 */
export function previewThemes(saved: readonly ThemeEntry[]): ThemeEntry[] {
  // Registered, not passed raw: an entry that `extends` another previews
  // with its base merged in (tokens and styles), as render_widget renders
  // it. Bases may come later in the list, so passes repeat while they make
  // progress; an entry that never registers is left out.
  const registry = createThemeRegistry();
  let pending = saved.filter((entry) => registry.get(entry.name) === undefined);
  for (let progress = true; progress && pending.length > 0; ) {
    const before = pending.length;
    pending = pending.filter((entry) => {
      try {
        registry.register(entry);
        return false;
      } catch {
        return true;
      }
    });
    progress = pending.length < before;
  }
  return registry.list();
}
