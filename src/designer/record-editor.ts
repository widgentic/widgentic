/**
 * Flat editor for a string→string record (hints: name → doc), under the
 * same flat discipline as the styles tree — one slim row per entry,
 * removal revealed by the row. Values are strings by construction, so
 * the tree enforces the exact shape; anything looser is a JSON-tab
 * affair.
 */
import { h } from "./dom.js";

export interface RecordEditor {
  element: HTMLElement;
  getValue(): Record<string, string> | undefined;
  setValue(record: Record<string, string> | undefined): void;
}

export function createRecordEditor(
  initial: Record<string, string> | undefined,
  placeholders: { key: string; value: string; add: string },
  onChange: (record: Record<string, string> | undefined) => void
): RecordEditor {
  let current: Record<string, string> | undefined = initial;
  const element = h("div", { class: "wgd-record" });

  function commit(next: Record<string, string>): void {
    // An emptied record means "none" — the owning key drops entirely.
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
    }) as HTMLInputElement;
    input.value = value;
    input.addEventListener("change", () => onCommit(input.value));
    return input;
  }

  function render(): void {
    const record = current ?? {};
    const rows = Object.entries(record).map(([key, value]) => {
      const keyInput = changeInput(
        key,
        placeholders.key,
        "wgd-input wgd-rec-key",
        (next) => {
          const entries = Object.entries(record).map(([k, v]) =>
            k === key ? ([next, v] as const) : ([k, v] as const)
          );
          commit(Object.fromEntries(entries));
        }
      );
      const valueInput = changeInput(
        value,
        placeholders.value,
        "wgd-input wgd-rec-value",
        (next) => commit({ ...record, [key]: next })
      );
      const remove = h(
        "button",
        { class: "wgd-icon", type: "button", title: "Remove entry" },
        ["✕"]
      );
      remove.addEventListener("click", () => {
        const { [key]: _gone, ...rest } = record;
        commit(rest);
      });
      return h("div", { class: "wgd-rec-row" }, [
        keyInput,
        h("span", { class: "wgd-st-colon" }, [":"]),
        valueInput,
        remove
      ]);
    });
    const add = h(
      "button",
      { class: "wgd-button wgd-add wgd-st-add", type: "button" },
      [placeholders.add]
    );
    add.addEventListener("click", () => {
      let key = "";
      for (let i = 1; key in record; i++) key = `key${i}`;
      commit({ ...record, [key]: "" });
    });
    element.replaceChildren(...rows, h("div", { class: "wgd-toolbar" }, [add]));
  }

  render();

  return {
    element,
    getValue: () => current,
    setValue(record) {
      if (element.contains(document.activeElement)) return;
      current = record;
      render();
    }
  };
}
