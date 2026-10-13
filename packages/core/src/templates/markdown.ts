/**
 * Markdown text binds: a small, fixed subset parsed into render-tree nodes.
 *
 * The parser, not the value, chooses tags: only `p`, `br`, `strong`, `em`,
 * `code`, `a`, `ul`, `ol` and `li` inside one `div.wg-md`, every character
 * of the value emitted as text, never parsed as HTML. Links face the same
 * URL guard as a bound `href`; a refused link renders as its text. Syntax
 * outside the subset (headings, fences, quotes, images, tables, raw HTML)
 * stays literal, so no data is hidden.
 *
 * Cost is bounded twice: a source over {@link MARKDOWN_SOURCE_MAX} renders
 * as one plain paragraph without parsing, and every emitted node spends the
 * render's node budget, so the parse is linear in a bounded source.
 */
import type { WidgetElementNode, WidgetNode } from "../catalog/index.js";
import { isSafeUrl } from "./guards.js";

/** The longest source parsed; a longer value renders as one plain paragraph. */
export const MARKDOWN_SOURCE_MAX = 20_000;

/** Every tag Markdown output can carry, its `div.wg-md` wrapper aside. */
export const MARKDOWN_TAGS = ["p", "br", "strong", "em", "code", "a", "ul", "ol", "li"] as const;

/** The render's node budget, shared with the interpreter. */
export interface MarkdownBudget {
  remaining: number;
  truncated: boolean;
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "literal"; lines: string[] }
  | { kind: "ul" | "ol"; start: number; items: string[][] };

const BULLET = /^\s*[-*+][ \t]+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)][ \t]+(.*)$/;
const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * Sort lines into paragraphs and flat lists; blank lines separate blocks.
 * A code fence is outside the subset: its lines, the fences included, form
 * one literal block that no inline syntax touches, through the closing
 * fence or the end of the value.
 */
function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Exclude<Block, { kind: "literal" }> | undefined;
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as string;
    const fence = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      const closing = new RegExp(`^\\s*${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
      const literal: string[] = [line];
      while (++index < lines.length) {
        literal.push(lines[index] as string);
        if (closing.test(lines[index] as string)) break;
      }
      blocks.push({ kind: "literal", lines: literal });
      current = undefined;
      continue;
    }
    if (line.trim() === "") {
      current = undefined;
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet === null ? ORDERED.exec(line) : null;
    if (bullet !== null || ordered !== null) {
      const kind = bullet !== null ? "ul" : "ol";
      const content = (bullet !== null ? bullet[1] : ordered?.[2]) ?? "";
      if (current === undefined || current.kind !== kind) {
        current = { kind, start: ordered === null ? 1 : Number(ordered[1]), items: [] };
        blocks.push(current);
      }
      current.items.push([content.trim()]);
      continue;
    }
    if (current === undefined) {
      current = { kind: "p", lines: [] };
      blocks.push(current);
    }
    // A line under an item continues it; any other line continues the paragraph.
    if (current.kind === "p") current.lines.push(line.trim());
    else current.items[current.items.length - 1]?.push(line.trim());
  }
  return blocks;
}

/** Characters a backslash makes literal. */
const ESCAPABLE = new Set("\\`*_[]()#+-.!{}<>|~\"'");

const isWhitespace = (char: string | undefined): boolean => char === undefined || /\s/.test(char);
const isPunctuation = (char: string | undefined): boolean =>
  char !== undefined && /[!-/:-@[-`{-~\u2000-\u206f\u2e00-\u2e7f]/.test(char);

type Entry =
  | { kind: "text"; value: string }
  | { kind: "node"; node: WidgetNode }
  | { kind: "delim"; char: "*" | "_"; count: number; canOpen: boolean; canClose: boolean; index: number };

/** Entries as nodes: a delimiter left unmatched is literal text; adjacent texts merge. */
function nodesOf(entries: readonly Entry[]): WidgetNode[] {
  const out: WidgetNode[] = [];
  for (const entry of entries) {
    const piece: WidgetNode =
      entry.kind === "node" ? entry.node : entry.kind === "text" ? entry.value : entry.char.repeat(entry.count);
    const last = out[out.length - 1];
    if (typeof piece === "string" && typeof last === "string") out[out.length - 1] = last + piece;
    else if (piece !== "") out.push(piece);
  }
  return out;
}

/**
 * Backtick runs by length, each list in source order, read through a
 * forward cursor: finding a closing run never rescans the text, so a value
 * of unmatched runs stays linear.
 */
function tickRuns(text: string): (length: number, from: number) => number {
  const runs = new Map<number, number[]>();
  for (let i = 0; i < text.length; ) {
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let end = i;
    while (text[end] === "`") end++;
    const list = runs.get(end - i) ?? [];
    list.push(i);
    runs.set(end - i, list);
    i = end;
  }
  const cursors = new Map<number, number>();
  return (length, from) => {
    const list = runs.get(length) ?? [];
    let cursor = cursors.get(length) ?? 0;
    while (cursor < list.length && (list[cursor] as number) < from) cursor++;
    cursors.set(length, cursor);
    return cursor < list.length ? (list[cursor] as number) : -1;
  };
}

/** How far a link's text and URL may reach, so a value of unmatched brackets stays linear. */
const LINK_LABEL_MAX = 1000;
const LINK_URL_MAX = 2048;

/** `[text](url)` starting at `start`: the text, the url and the index after `)`. */
function linkAt(text: string, start: number): { label: string; url: string; end: number } | undefined {
  let depth = 0;
  let i = start;
  const labelEnd = Math.min(text.length, start + LINK_LABEL_MAX);
  for (; i < labelEnd; i++) {
    const char = text[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === "[") depth++;
    else if (char === "]" && --depth === 0) break;
  }
  if (i >= labelEnd || text[i + 1] !== "(") return undefined;
  // The URL ends at the `)` that balances its own parentheses.
  const urlEnd = Math.min(text.length, i + 2 + LINK_URL_MAX);
  let close = i + 2;
  for (let parens = 0; close < urlEnd; close++) {
    if (text[close] === "(") parens++;
    else if (text[close] === ")" && parens-- === 0) break;
  }
  if (close >= urlEnd) return undefined;
  const url = text.slice(i + 2, close);
  if (url === "" || /\s/.test(url)) return undefined;
  return { label: text.slice(start + 1, i), url, end: close + 1 };
}

/**
 * Inline syntax in one left-to-right scan: code spans and escapes first,
 * then links (whose text is parsed again, without links), then emphasis
 * through a delimiter stack. Line breaks are `br`.
 */
function inline(text: string, links: boolean): WidgetNode[] {
  const stack: Entry[] = [];
  // Open delimiters per character, so finding an opener never rescans the stack.
  const openers: Record<"*" | "_", Extract<Entry, { kind: "delim" }>[]> = { "*": [], _: [] };
  const pushText = (value: string) => {
    const last = stack[stack.length - 1];
    if (last?.kind === "text") last.value += value;
    else stack.push({ kind: "text", value });
  };
  const pushNode = (node: WidgetNode) => stack.push({ kind: "node", node });
  const closingTicks = tickRuns(text);

  let i = 0;
  while (i < text.length) {
    const char = text[i] as string;
    if (char === "\\" && i + 1 < text.length && ESCAPABLE.has(text[i + 1] as string)) {
      pushText(text[i + 1] as string);
      i += 2;
      continue;
    }
    if (char === "\n") {
      pushNode({ tag: "br" });
      i++;
      continue;
    }
    if (char === "`") {
      let end = i;
      while (text[end] === "`") end++;
      const close = closingTicks(end - i, end);
      if (close === -1) {
        pushText(text.slice(i, end));
        i = end;
        continue;
      }
      let code = text.slice(end, close).replace(/\n/g, " ");
      if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") code = code.slice(1, -1);
      pushNode(code === "" ? { tag: "code" } : { tag: "code", children: [code] });
      i = close + (end - i);
      continue;
    }
    if (char === "!" && text[i + 1] === "[" && links) {
      // An image is outside the subset: its source stays literal text.
      const image = linkAt(text, i + 1);
      if (image !== undefined) {
        pushText(text.slice(i, image.end));
        i = image.end;
        continue;
      }
    }
    if (char === "[" && links) {
      const link = linkAt(text, i);
      if (link !== undefined) {
        const label = inline(link.label, false);
        const href = link.url.trim();
        if (isSafeUrl(href)) {
          const anchor: WidgetElementNode = { tag: "a", attrs: { href, rel: "noopener noreferrer" } };
          if (label.length > 0) anchor.children = label;
          pushNode(anchor);
        } else {
          for (const piece of label) {
            if (typeof piece === "string") pushText(piece);
            else pushNode(piece);
          }
        }
        i = link.end;
        continue;
      }
    }
    if (char === "*" || char === "_") {
      const delim: "*" | "_" = char;
      let end = i;
      while (text[end] === delim) end++;
      const before = text[i - 1];
      const after = text[end];
      const left = !isWhitespace(after) && (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before));
      const right = !isWhitespace(before) && (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after));
      // An underscore inside a word is literal, so snake_case stays text.
      const canOpen = delim === "*" ? left : left && (!right || isPunctuation(before));
      const canClose = delim === "*" ? right : right && (!left || isPunctuation(after));
      let remaining = end - i;
      if (canClose) {
        const mine = openers[delim];
        while (remaining > 0) {
          while (mine.length > 0 && (mine[mine.length - 1] as { count: number }).count === 0) mine.pop();
          const opener = mine[mine.length - 1];
          if (opener === undefined) break;
          const use = opener.count >= 2 && remaining >= 2 ? 2 : 1;
          const inner = stack.splice(opener.index + 1);
          // Delimiters of the other character inside the span stay literal.
          const theirs = openers[delim === "*" ? "_" : "*"];
          while (theirs.length > 0 && (theirs[theirs.length - 1] as { index: number }).index > opener.index) theirs.pop();
          const children = nodesOf(inner);
          opener.count -= use;
          remaining -= use;
          if (opener.count === 0) {
            stack.pop();
            mine.pop();
          }
          const element: WidgetElementNode = { tag: use === 2 ? "strong" : "em" };
          if (children.length > 0) element.children = children;
          pushNode(element);
        }
      }
      if (remaining > 0) {
        if (canOpen) {
          const entry = { kind: "delim" as const, char: delim, count: remaining, canOpen, canClose, index: stack.length };
          stack.push(entry);
          openers[delim].push(entry);
        } else {
          pushText(delim.repeat(remaining));
        }
      }
      i = end;
      continue;
    }
    pushText(char);
    i++;
  }
  return nodesOf(stack);
}

/** Copy `node` in document order while the budget lasts; one unit per element or text. */
function spend(node: WidgetNode, budget: MarkdownBudget): WidgetNode | undefined {
  if (budget.remaining <= 0) {
    budget.truncated = true;
    return undefined;
  }
  budget.remaining--;
  if (typeof node === "string" || node.children === undefined) return node;
  const children: WidgetNode[] = [];
  for (const child of node.children) {
    const kept = spend(child, budget);
    if (kept === undefined) break;
    children.push(kept);
  }
  const copy: WidgetElementNode = { ...node };
  if (children.length > 0) copy.children = children;
  else delete copy.children;
  return copy;
}

const element = (tag: string, children: WidgetNode[], attrs?: Record<string, string>): WidgetElementNode => {
  const node: WidgetElementNode = { tag };
  if (attrs !== undefined) node.attrs = attrs;
  if (children.length > 0) node.children = children;
  return node;
};

/**
 * Parse `source` into one `div.wg-md`, spending `budget` — or nothing for
 * an empty or whitespace-only value. Never throws.
 */
export function parseMarkdown(source: string, budget: MarkdownBudget): WidgetNode[] {
  const text = source.replace(/\r\n?/g, "\n");
  if (text.trim() === "") return [];
  let children: WidgetNode[];
  if (text.length > MARKDOWN_SOURCE_MAX) {
    children = [element("p", [text])];
  } else {
    children = blocksOf(text).map((block) => {
      if (block.kind === "p") return element("p", inline(block.lines.join("\n"), true));
      if (block.kind === "literal") {
        return element("p", block.lines.flatMap((line, i): WidgetNode[] => [
          ...(i === 0 ? [] : [{ tag: "br" }]),
          ...(line === "" ? [] : [line])
        ]));
      }
      const items = block.items.map((lines) => element("li", inline(lines.join("\n"), true)));
      return element(block.kind, items, block.kind === "ol" && block.start !== 1 ? { start: String(block.start) } : undefined);
    });
  }
  const root = spend(element("div", children, { class: "wg-md" }), budget);
  return root === undefined ? [] : [root];
}
