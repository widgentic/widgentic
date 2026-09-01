/**
 * The bind format engine: a CLOSED, data-only presentation vocabulary.
 *
 * Formatting is render-time, never fold-time — the payload keeps the typed
 * value while the render gets its unit, so an initial render, a preview and
 * an action's re-render all present the same data the same way and a second
 * fold never formats an already-formatted string.
 *
 * Determinism is a hard requirement: server render, designer preview and
 * in-frame re-render must agree byte for byte, or the patcher would see
 * phantom text changes. Hence a fixed default locale, UTC throughout (an
 * unzoned ISO value is read as UTC — ECMAScript would read it as LOCAL
 * time), and ordinary spaces in numeric output (ICU builds differ in the
 * no-break spaces they emit).
 *
 * Total by construction: a value the format cannot parse renders as its
 * plain `formatValue` text. A format never hides data and never throws.
 */
import { isPlainObject } from "../../shared/plain-object.js";
import { formatValue } from "./format.js";

/** Format kinds. Closed — an unknown `type` fails validation. */
export const FORMAT_TYPES = ["number", "currency", "date"] as const;

export type FormatType = (typeof FORMAT_TYPES)[number];

export const isFormatType = (value: unknown): value is FormatType =>
  FORMAT_TYPES.some((type) => type === value);

/** Bounds on `decimals` (inclusive), shared by the validator and the guide. */
export const FORMAT_DECIMALS_MIN = 0;
export const FORMAT_DECIMALS_MAX = 8;

/** How a currency names itself. `narrowSymbol` is the default: `$3,207`. */
export const CURRENCY_DISPLAYS = ["narrowSymbol", "symbol", "code"] as const;

export type CurrencyDisplay = (typeof CURRENCY_DISPLAYS)[number];

export const isCurrencyDisplay = (value: unknown): value is CurrencyDisplay =>
  CURRENCY_DISPLAYS.some((display) => display === value);

/** ISO-4217: three uppercase letters. */
export const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * The date pattern's tokens, longest first — the tokenizer scans in this
 * order so `mm` cannot eat the tail of `MM`.
 */
export const DATE_TOKENS = ["yyyy", "MM", "dd", "HH", "mm", "ss"] as const;

/** Characters a pattern may carry outside its tokens. */
export const DATE_PATTERN_SEPARATORS = " -/:.,T";

/** Bound on a date pattern's length — a pattern is a format, not a document. */
export const DATE_PATTERN_MAX = 40;

/** Every character a date pattern may contain (tokens + separators). */
export const DATE_PATTERN_ALLOWED = new RegExp(
  `^[${DATE_PATTERN_SEPARATORS.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}yMdHms]*$`
);

/**
 * Epoch numbers below this are SECONDS, above it MILLISECONDS — the two
 * shapes APIs emit. 1e11 s is the year 5138, 1e11 ms is 1973, so no real
 * timestamp is ambiguous under the split.
 */
export const EPOCH_SECONDS_BELOW = 1e11;

/**
 * A locale is an author literal, shape-bounded here; the validator also asks
 * the runtime whether it knows the tag, so a typo cannot reach a render.
 */
export const LOCALE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{2,8}){0,3}$/;

/** The default locale — fixed so every surface formats identically. */
export const DEFAULT_FORMAT_LOCALE = "en-US";

export interface NumberFormatSpec {
  type: "number";
  decimals?: number;
  locale?: string;
}

export interface CurrencyFormatSpec {
  type: "currency";
  currency: string;
  decimals?: number;
  currencyDisplay?: CurrencyDisplay;
  locale?: string;
}

export interface DateFormatSpec {
  type: "date";
  pattern: string;
}

/** A bind's presentation transform. */
export type FormatSpec = NumberFormatSpec | CurrencyFormatSpec | DateFormatSpec;

/** A tokenized pattern: literal runs and the tokens between them. */
export type DatePatternPart = { token: (typeof DATE_TOKENS)[number] } | { literal: string };

/**
 * Split a pattern into tokens and literals. Every letter must belong to a
 * token — a stray `d` or `yy` would render as itself for every value, a
 * constant that hides the data — so a pattern with leftover letters or no
 * token at all tokenizes to `undefined`.
 */
export function tokenizeDatePattern(pattern: string): DatePatternPart[] | undefined {
  const parts: DatePatternPart[] = [];
  let literal = "";
  let tokens = 0;
  let i = 0;
  outer: while (i < pattern.length) {
    for (const token of DATE_TOKENS) {
      if (pattern.startsWith(token, i)) {
        if (literal !== "") parts.push({ literal });
        literal = "";
        parts.push({ token });
        tokens += 1;
        i += token.length;
        continue outer;
      }
    }
    const char = pattern[i] as string;
    if (/[A-Za-z]/.test(char)) return undefined;
    literal += char;
    i += 1;
  }
  if (literal !== "") parts.push({ literal });
  return tokens === 0 ? undefined : parts;
}

/** Whether the runtime knows a locale tag (a malformed tag throws → false). */
export function isKnownLocale(tag: string): boolean {
  try {
    return Intl.NumberFormat.supportedLocalesOf([tag]).length > 0;
  } catch {
    return false;
  }
}

/**
 * A finite number from a number or a numeric STRING — the shape every JSON
 * API that fears float precision returns.
 */
function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Epoch milliseconds from an ISO-8601 string or an epoch number (seconds
 * below {@link EPOCH_SECONDS_BELOW}, milliseconds above). An unzoned value
 * is read as UTC; fractional seconds beyond three digits are truncated,
 * since `Date.parse` is not required to accept them.
 */
function toEpochMillis(value: unknown): number | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return Math.abs(value) < EPOCH_SECONDS_BELOW ? value * 1000 : value;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const iso =
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(
      trimmed
    );
  if (iso === null) return undefined;
  const [, date, time, fraction, zone] = iso;
  const millis = fraction === undefined ? "" : `.${fraction.slice(0, 3)}`;
  const clock = time === undefined ? "00:00:00" : time.length === 5 ? `${time}:00` : time;
  const parsed = Date.parse(`${date}T${clock}${millis}${zone ?? "Z"}`);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const pad = (value: number, width: number): string => String(value).padStart(width, "0");

/** Substitute the tokens from the UTC fields of `millis`. */
function formatDate(millis: number, parts: readonly DatePatternPart[]): string {
  const at = new Date(millis);
  const field = (token: (typeof DATE_TOKENS)[number]): string => {
    switch (token) {
      case "yyyy": return pad(at.getUTCFullYear(), 4);
      case "MM": return pad(at.getUTCMonth() + 1, 2);
      case "dd": return pad(at.getUTCDate(), 2);
      case "HH": return pad(at.getUTCHours(), 2);
      case "mm": return pad(at.getUTCMinutes(), 2);
      case "ss": return pad(at.getUTCSeconds(), 2);
    }
  };
  return parts.map((part) => ("token" in part ? field(part.token) : part.literal)).join("");
}

/** ICU emits U+00A0 / U+202F / U+2009 where locales space digits and symbols. */
const UNICODE_SPACES = /[\u00A0\u202F\u2009]/g;

/** Every parse failure or malformed spec formats as the plain value. */
const plain = (value: unknown): string => formatValue(value);

type Formatter = (value: unknown) => string;

/**
 * Narrow an author spec to the engine's typed shape, defaults applied. The
 * validator refuses everything this returns `undefined` for; it stays here
 * so a spec reaching the engine unvalidated degrades to plain text.
 */
export function parseFormatSpec(spec: unknown): FormatSpec | undefined {
  if (!isPlainObject(spec) || !isFormatType(spec.type)) return undefined;
  if (spec.type === "date") {
    return typeof spec.pattern === "string" ? { type: "date", pattern: spec.pattern } : undefined;
  }
  const decimals =
    typeof spec.decimals === "number" &&
    Number.isInteger(spec.decimals) &&
    spec.decimals >= FORMAT_DECIMALS_MIN &&
    spec.decimals <= FORMAT_DECIMALS_MAX
      ? spec.decimals
      : undefined;
  const locale =
    typeof spec.locale === "string" && LOCALE_TAG.test(spec.locale) ? spec.locale : undefined;
  const common = {
    ...(decimals === undefined ? {} : { decimals }),
    ...(locale === undefined ? {} : { locale })
  };
  if (spec.type === "number") return { type: "number", ...common };
  if (typeof spec.currency !== "string" || !CURRENCY_CODE.test(spec.currency)) return undefined;
  return {
    type: "currency",
    currency: spec.currency,
    ...(isCurrencyDisplay(spec.currencyDisplay) ? { currencyDisplay: spec.currencyDisplay } : {}),
    ...common
  };
}

/**
 * Build the formatter for one spec: the `Intl.NumberFormat` instance and the
 * tokenized pattern are created here, once, not per value — a table over a
 * list formats thousands of cells through one instance.
 */
function buildFormatter(spec: FormatSpec): Formatter {
  if (spec.type === "date") {
    const parts = tokenizeDatePattern(spec.pattern);
    if (parts === undefined) return plain;
    return (value) => {
      const millis = toEpochMillis(value);
      return millis === undefined ? plain(value) : formatDate(millis, parts);
    };
  }
  const locale = spec.locale ?? DEFAULT_FORMAT_LOCALE;
  const digits: Intl.NumberFormatOptions =
    spec.decimals === undefined
      ? {}
      : { minimumFractionDigits: spec.decimals, maximumFractionDigits: spec.decimals };
  let intl: Intl.NumberFormat;
  try {
    intl =
      spec.type === "number"
        ? new Intl.NumberFormat(locale, digits)
        : new Intl.NumberFormat(locale, {
            style: "currency",
            currency: spec.currency,
            currencyDisplay: spec.currencyDisplay ?? "narrowSymbol",
            ...digits
          });
  } catch {
    // An engine that rejects an author literal must not break the render.
    return plain;
  }
  return (value) => {
    const numeric = toFiniteNumber(value);
    return numeric === undefined ? plain(value) : intl.format(numeric).replace(UNICODE_SPACES, " ");
  };
}

/**
 * Formatters keyed by the spec OBJECT, which lives as long as the compiled
 * template that carries it. Holds locale/currency configuration only —
 * never tenant data — so the per-request no-cache rule is untouched.
 */
const compiled = new WeakMap<object, Formatter>();

/** The formatter for `spec`, built once per spec object. */
export function compileFormat(spec: unknown): Formatter {
  if (!isPlainObject(spec)) return plain;
  const cached = compiled.get(spec);
  if (cached !== undefined) return cached;
  const parsed = parseFormatSpec(spec);
  const formatter = parsed === undefined ? plain : buildFormatter(parsed);
  compiled.set(spec, formatter);
  return formatter;
}

/** Render `value` through `spec`, or as plain text when it cannot be parsed. */
export function formatBoundValue(value: unknown, spec: unknown): string {
  return compileFormat(spec)(value);
}
