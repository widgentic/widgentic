/**
 * The styles panel both designers mount — a widget's descriptor styles and
 * a theme's shared styles are one shape under one rule set, so they get one
 * editor: the structured Tree and a parse-gated JSON view over the same
 * value, plus the audit's list of entries the renderer would drop.
 */
import { isPlainObject } from "@widgentic/core";
import type { WidgetStyles } from "@widgentic/core";
import { diagnosticLine, h, requireChild, section, tabs, textArea } from "./dom.js";
import { attachJsonHighlight, repaintHighlight } from "./highlight.js";
import { errorMessage } from "./internal.js";
import { createStylesEditor } from "./styles-editor.js";
import type { StyleIssue } from "./validate.js";

export interface StylesPanel {
  element: HTMLElement;
  /** Reflect a value set elsewhere; the JSON view keeps a focused edit. */
  setValue(styles: WidgetStyles | undefined): void;
  setIssues(issues: StyleIssue[]): void;
}

export function createStylesPanel(
  initial: WidgetStyles | undefined,
  onChange: (styles: WidgetStyles | undefined) => void
): StylesPanel {
  // The two views keep each other in step: an edit in one reaches the
  // other before the host hears of it, whatever the host refreshes.
  const tree = createStylesEditor(initial, (styles) => {
    showJson(styles);
    onChange(styles);
  });
  const parseError = diagnosticLine(undefined);
  // No legend — the section title already names the shape.
  const field = textArea("", initial === undefined ? "" : JSON.stringify(initial, null, 2), (text) => {
    if (text.trim() === "") {
      parseError.hidden = true;
      tree.setValue(undefined);
      onChange(undefined);
      return;
    }
    try {
      const value: unknown = JSON.parse(text);
      parseError.hidden = true;
      parseError.textContent = "";
      // Last valid wins: only an object reaches the value.
      if (isPlainObject(value)) {
        tree.setValue(value as WidgetStyles);
        onChange(value as WidgetStyles);
      }
    } catch (error) {
      parseError.hidden = false;
      parseError.textContent = `Invalid JSON (the last valid value is kept): ${errorMessage(error)}`;
    }
  });
  const area = requireChild(field, "textarea");
  attachJsonHighlight(area);

  function showJson(styles: WidgetStyles | undefined): void {
    if (document.activeElement === area) return;
    area.value = styles === undefined ? "" : JSON.stringify(styles, null, 2);
    repaintHighlight(area); // programmatic writes fire no input event
  }

  const issues = h("div");
  const element = section("Styles (.wg- selectors only)", [
    tabs([
      { label: "Tree", element: tree.element },
      { label: "JSON", element: h("div", undefined, [field, parseError]) }
    ]),
    issues
  ]);
  return {
    element,
    setValue(styles) {
      tree.setValue(styles);
      showJson(styles);
    },
    setIssues(list) {
      issues.replaceChildren(
        ...list.map((issue) =>
          diagnosticLine(`${issue.selector}${issue.property ? ` → ${issue.property}` : ""}: ${issue.message}`)
        )
      );
    }
  };
}
