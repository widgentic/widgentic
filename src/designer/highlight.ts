/**
 * Cheap syntax coloring for the JSON textareas: a highlighted <pre> layer
 * sits exactly behind a transparent-text <textarea>, so the browser keeps
 * doing all the real work (typing, selection, undo, IME) and we only paint
 * colors. No editor library, no parsing beyond a tokenizer — invalid JSON
 * still colors sensibly because the tokenizer is regex-based, never a
 * parser.
 *
 * The two layers must agree on every metric that affects glyph position
 * (font, size, line-height, padding, border width, white-space); the
 * stylesheet keeps them in lockstep.
 */

interface Token {
  /** Token class suffix: k(ey) s(tring) n(umber) b(oolean/null) p(unctuation). */
  cls: string;
  text: string;
}

const JSON_TOKENS =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g;

export function tokenizeJson(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  JSON_TOKENS.lastIndex = 0;
  while ((match = JSON_TOKENS.exec(text)) !== null) {
    if (match.index > last) out.push({ cls: "", text: text.slice(last, match.index) });
    if (match[1] !== undefined) {
      // A string followed by ':' is an object key.
      if (match[2] !== undefined) {
        out.push({ cls: "k", text: match[1] });
        out.push({ cls: "p", text: match[2] });
      } else {
        out.push({ cls: "s", text: match[1] });
      }
    } else if (match[3] !== undefined) {
      out.push({ cls: "n", text: match[3] });
    } else if (match[4] !== undefined) {
      out.push({ cls: "b", text: match[4] });
    } else if (match[5] !== undefined) {
      out.push({ cls: "p", text: match[5] });
    }
    last = JSON_TOKENS.lastIndex;
  }
  if (last < text.length) out.push({ cls: "", text: text.slice(last) });
  return out;
}

/** Paint tokens into the layer as DOM nodes (never innerHTML). */
function paint(layer: HTMLElement, text: string): void {
  const nodes: Node[] = [];
  for (const token of tokenizeJson(text)) {
    if (token.cls === "") {
      nodes.push(document.createTextNode(token.text));
      continue;
    }
    const span = document.createElement("span");
    span.className = `wgd-hl-${token.cls}`;
    span.textContent = token.text;
    nodes.push(span);
  }
  // A trailing newline needs a following glyph box to render as a line.
  nodes.push(document.createTextNode("\n"));
  layer.replaceChildren(...nodes);
}

/**
 * Wrap a textarea in the highlight layer. Returns a disposer that restores
 * the original DOM shape.
 */
export function attachJsonHighlight(textarea: HTMLTextAreaElement): () => void {
  const parent = textarea.parentNode;
  if (parent === null) return () => undefined;

  const wrap = document.createElement("div");
  wrap.className = "wgd-hlwrap";
  const layer = document.createElement("pre");
  layer.className = "wgd-hl";
  layer.setAttribute("aria-hidden", "true");

  parent.insertBefore(wrap, textarea);
  wrap.append(layer, textarea);
  textarea.classList.add("wgd-hl-input");

  const sync = (): void => {
    paint(layer, textarea.value);
    layer.scrollTop = textarea.scrollTop;
    layer.scrollLeft = textarea.scrollLeft;
  };
  const syncScroll = (): void => {
    layer.scrollTop = textarea.scrollTop;
    layer.scrollLeft = textarea.scrollLeft;
  };
  // Tab indents instead of moving focus — these panes hold indented JSON.
  // Shift+Tab keeps its focus-moving default as the keyboard escape.
  const onTab = (event: KeyboardEvent): void => {
    if (event.key !== "Tab" || event.shiftKey || textarea.readOnly) return;
    event.preventDefault();
    const { selectionStart, selectionEnd, value } = textarea;
    textarea.value = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
    textarea.selectionStart = textarea.selectionEnd = selectionStart + 2;
    // The commit path listens for input; a synthetic one keeps the store
    // and the paint layer in step with the inserted spaces.
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  };

  textarea.addEventListener("input", sync);
  textarea.addEventListener("scroll", syncScroll);
  textarea.addEventListener("keydown", onTab);
  sync();

  return () => {
    textarea.removeEventListener("input", sync);
    textarea.removeEventListener("scroll", syncScroll);
    textarea.removeEventListener("keydown", onTab);
    textarea.classList.remove("wgd-hl-input");
    wrap.replaceWith(textarea);
  };
}

/**
 * Repaint after a programmatic value change (store refresh), which fires
 * no input event.
 */
export function repaintHighlight(textarea: HTMLTextAreaElement): void {
  const layer = textarea.parentElement?.querySelector(".wgd-hl");
  if (layer instanceof HTMLElement) paint(layer, textarea.value);
}
