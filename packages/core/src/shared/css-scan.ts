/**
 * Bracket-aware reading of the CSS text the style and token guards inspect.
 * Depth counts `(` and `[` only outside quoted strings, so a parenthesis
 * inside an attribute value can neither hide a comma nor close a
 * pseudo-class early. Strings carry no escapes here: every guard bans `\`.
 */

interface ScannedChar {
  char: string;
  /** Bracket depth around the character; a bracket itself sits at the outer depth. */
  depth: number;
  /** Part of a quoted string, quotes included. */
  quoted: boolean;
}

function scan(text: string): ScannedChar[] {
  const out: ScannedChar[] = [];
  let depth = 0;
  let quote: string | undefined;
  // UTF-16 units, so indices match `String.slice`; brackets and quotes are
  // never surrogate halves.
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (quote !== undefined) {
      out.push({ char, depth, quoted: true });
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
      out.push({ char, depth, quoted: true });
    } else if (char === "(" || char === "[") {
      out.push({ char, depth, quoted: false });
      depth++;
    } else if (char === ")" || char === "]") {
      depth = Math.max(0, depth - 1);
      out.push({ char, depth, quoted: false });
    } else {
      out.push({ char, depth, quoted: false });
    }
  }
  return out;
}

const isBracket = (char: string) => char === "(" || char === ")" || char === "[" || char === "]";

/**
 * Every `(` and `[` closed in order and every string closed. An unclosed
 * bracket or string runs on through the rest of the stylesheet, swallowing
 * every rule after it.
 */
export function isBalanced(text: string): boolean {
  const open: string[] = [];
  let quote: string | undefined;
  for (let i = 0; i < text.length; i++) {
    const char = text.charAt(i);
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(" || char === "[") {
      open.push(char === "(" ? ")" : "]");
    } else if (char === ")" || char === "]") {
      if (open.pop() !== char) return false;
    }
  }
  return open.length === 0 && quote === undefined;
}

/** Split on `separator` characters outside every bracket and string; empty pieces dropped. */
export function splitTopLevel(text: string, separator: (char: string) => boolean): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const { char, depth, quoted } of scan(text)) {
    if (depth === 0 && !quoted && separator(char)) {
      pieces.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  pieces.push(current.trim());
  return pieces.filter((piece) => piece.length > 0);
}

/** The text outside every bracket and string: what a selector says at its own level. */
export function topLevelText(text: string): string {
  return scan(text)
    .filter(({ char, depth, quoted }) => depth === 0 && !quoted && !isBracket(char))
    .map(({ char }) => char)
    .join("");
}

/** Index of the first character outside every bracket and string that passes `test`, or -1. */
export function indexOfTopLevel(text: string, test: (char: string) => boolean): number {
  return scan(text).findIndex(({ char, depth, quoted }) => depth === 0 && !quoted && test(char));
}

/**
 * The argument of each top-level functional pseudo-class named in `names`
 * (`:is(…)` → `…`), so a guard can look inside the ones that pass their
 * argument's matches through.
 */
export function pseudoArguments(text: string, names: readonly string[]): string[] {
  const chars = scan(text);
  const args: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const entry = chars[i];
    if (entry === undefined || entry.char !== "(" || entry.depth !== 0 || entry.quoted) continue;
    const before = text.slice(0, i).toLowerCase();
    if (!names.some((name) => before.endsWith(`:${name}`))) continue;
    let end = i + 1;
    while (end < chars.length) {
      const closer = chars[end];
      if (closer !== undefined && closer.char === ")" && closer.depth === 0 && !closer.quoted) break;
      end++;
    }
    args.push(text.slice(i + 1, end));
  }
  return args;
}
