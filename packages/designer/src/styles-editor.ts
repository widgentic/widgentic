/**
 * Structured editor for the descriptor's styles — selector rows with
 * their declaration rows, under the template tree's flat discipline.
 * The value is `Record<selector, Record<property, value>>` (strings
 * only), so the tree enforces the exact shape the server's style guards
 * expect; anything looser belongs in the JSON tab.
 */
import { isPlainObject } from "@widgentic/core";
import { h } from "./dom.js";

export type WidgetStylesValue = Record<string, Record<string, string>>;

export interface StylesEditor {
  element: HTMLElement;
  getValue(): WidgetStylesValue | undefined;
  setValue(styles: WidgetStylesValue | undefined): void;
}

export function createStylesEditor(
  initial: WidgetStylesValue | undefined,
  onChange: (styles: WidgetStylesValue | undefined) => void
): StylesEditor {
  let current: WidgetStylesValue | undefined = initial;
  const element = h("div", { class: "wgd-styles" });

  function commit(next: WidgetStylesValue): void {
    // An emptied record means "no styles" — the descriptor drops the key.
    current = Object.keys(next).length > 0 ? next : undefined;
    onChange(current);
    render();
  }

  function changeInput(
    value: string,
    placeholder: string,
    className: string,
    onCommit: (value: string) => void
  ): HTMLInputElement {
    const input = h("input", {
      type: "text",
      class: className,
      placeholder,
      spellcheck: "false"
    });
    input.value = value;
    input.addEventListener("change", () => onCommit(input.value));
    return input;
  }

  function renderSelector(
    selector: string,
    declarations: Record<string, string>,
    styles: WidgetStylesValue
  ): HTMLElement {
    const rename = changeInput(
      selector,
      ".wg-selector",
      "wgd-input wgd-st-selector",
      (next) => {
        const entries = Object.entries(styles).map(([k, v]) =>
          k === selector ? ([next, v] as const) : ([k, v] as const)
        );
        commit(Object.fromEntries(entries));
      }
    );
    const addDecl = h(
      "button",
      { class: "wgd-icon", type: "button", title: "Add declaration" },
      ["+"]
    );
    addDecl.addEventListener("click", () => {
      commit({ ...styles, [selector]: { ...declarations, "": "" } });
    });
    const removeSelector = h(
      "button",
      { class: "wgd-icon", type: "button", title: "Remove selector" },
      ["✕"]
    );
    removeSelector.addEventListener("click", () => {
      const { [selector]: _gone, ...rest } = styles;
      commit(rest);
    });
    const declRows = Object.entries(declarations).map(([property, value]) => {
      const propInput = changeInput(
        property,
        "property",
        "wgd-input wgd-st-prop",
        (next) => {
          const entries = Object.entries(declarations).map(([k, v]) =>
            k === property ? ([next, v] as const) : ([k, v] as const)
          );
          commit({ ...styles, [selector]: Object.fromEntries(entries) });
        }
      );
      const valueInput = changeInput(
        value,
        "value (no url(...), no ;)",
        "wgd-input wgd-st-value",
        (next) => {
          commit({
            ...styles,
            [selector]: { ...declarations, [property]: next }
          });
        }
      );
      const removeDecl = h(
        "button",
        { class: "wgd-icon", type: "button", title: "Remove declaration" },
        ["✕"]
      );
      removeDecl.addEventListener("click", () => {
        const { [property]: _gone, ...rest } = declarations;
        commit({ ...styles, [selector]: rest });
      });
      return h("div", { class: "wgd-st-decl" }, [
        propInput,
        h("span", { class: "wgd-st-colon" }, [":"]),
        valueInput,
        removeDecl
      ]);
    });
    return h("div", { class: "wgd-st-rule" }, [
      h("div", { class: "wgd-st-row" }, [
        rename,
        h("span", { class: "wgd-node-icons" }, [addDecl, removeSelector])
      ]),
      h("div", { class: "wgd-st-decls" }, declRows)
    ]);
  }

  function render(): void {
    const styles = current ?? {};
    const addSelector = h(
      "button",
      { class: "wgd-button wgd-add wgd-st-add", type: "button" },
      ["+ selector"]
    );
    addSelector.addEventListener("click", () => {
      let name = ".wg-";
      for (let i = 1; name in styles; i++) name = `.wg-${i}`;
      commit({ ...styles, [name]: {} });
    });
    element.replaceChildren(
      ...Object.entries(styles).map(([selector, declarations]) =>
        renderSelector(
          selector,
          isPlainObject(declarations)
            ? (declarations as Record<string, string>)
            : {},
          styles
        )
      ),
      h("div", { class: "wgd-toolbar" }, [addSelector])
    );
  }

  render();

  return {
    element,
    getValue: () => current,
    setValue(styles) {
      if (element.contains(document.activeElement)) return;
      current = styles;
      render();
    }
  };
}
