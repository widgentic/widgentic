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
 * phantom text changes. Hence a fixed default locale, UTC unless a date's
 * `zone` says otherwise (an unzoned ISO value is read as UTC — ECMAScript
 * would read it as LOCAL time), and ordinary spaces in numeric output (ICU
 * builds differ in the no-break spaces they emit). A date's `value` zone is
 * as deterministic as UTC; its `viewer` zone renders UTC text that only the
 * app template's frame rewrites, from the instant the renderer marks.
 *
 * Total by construction: a value the format cannot parse renders as its
 * plain `formatValue` text. A format never hides data and never throws.
 */
import { isPlainObject } from "../../shared/plain-object.js";
import { formatValue } from "./format.js";

/**
 * Format kinds. Closed — an unknown `type` fails validation. The first
 * three present one value; the text formats present a list or a text.
 */
export const FORMAT_TYPES = ["number", "currency", "date", "count", "join", "truncate", "pluralize"] as const;

export type FormatType = (typeof FORMAT_TYPES)[number];

/** The formats that read a list: count and join, and pluralize, which also reads a number. */
export const LIST_FORMAT_TYPES = ["count", "join", "pluralize"] as const;

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

/** The wall clock a date's tokens read. `utc`, the default, may be omitted. */
export const DATE_ZONES = ["utc", "value", "viewer"] as const;

export type DateZone = (typeof DATE_ZONES)[number];

export const isDateZone = (value: unknown): value is DateZone =>
  DATE_ZONES.some((zone) => zone === value);

/** The zones as authors and agents read them, derived by every surface that documents the date format. */
export const DATE_ZONE_RULE =
  "zone: utc (the default) shows the instant in UTC; value shows the time the value itself states " +
  "(its own offset, an unzoned value as written, an epoch number in UTC); viewer shows the viewer's " +
  "local time inside MCP Apps frames and UTC everywhere else, and is for text binds only.";

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

/** Bound on a `join` separator or last separator, in characters. */
export const JOIN_SEPARATOR_MAX = 16;

/** The separator a `join` uses when the author gives none. */
export const JOIN_DEFAULT_SEPARATOR = ", ";

/** Bounds on a `truncate` length (inclusive), in code points. */
export const TRUNCATE_LENGTH_MIN = 1;
export const TRUNCATE_LENGTH_MAX = 1000;

/** Bound on a `truncate` ellipsis, in characters. */
export const TRUNCATE_ELLIPSIS_MAX = 8;

/** The ellipsis a `truncate` appends when the author gives none. */
export const TRUNCATE_DEFAULT_ELLIPSIS = "…";

/** The CLDR plural categories a `pluralize` form may be keyed by; `other` is required. */
export const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

export const isPluralCategory = (value: unknown): value is PluralCategory =>
  PLURAL_CATEGORIES.some((category) => category === value);

/** Bound on one `pluralize` form, in characters. */
export const PLURAL_FORM_MAX = 80;

/** Replaced in a `pluralize` form by the grouped number. */
export const PLURAL_COUNT_PLACEHOLDER = "{count}";

/**
 * A `join` field: dot segments read in the item's own scope, none of them
 * empty or `$`-prefixed — no scope tokens, since an item has no `each`
 * chain of its own.
 */
export const isPlainDottedPath = (value: unknown): value is string =>
  typeof value === "string" &&
  value.split(".").every((segment) => segment !== "" && !segment.startsWith("$"));

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
  zone?: DateZone;
}

export interface CountFormatSpec {
  type: "count";
  locale?: string;
}

export interface JoinFormatSpec {
  type: "join";
  separator?: string;
  last?: string;
  field?: string;
}

export interface TruncateFormatSpec {
  type: "truncate";
  length: number;
  ellipsis?: string;
}

export interface PluralizeFormatSpec {
  type: "pluralize";
  forms: Partial<Record<PluralCategory, string>> & { other: string };
  locale?: string;
}

/** A bind's presentation transform. */
export type FormatSpec =
  | NumberFormatSpec
  | CurrencyFormatSpec
  | DateFormatSpec
  | CountFormatSpec
  | JoinFormatSpec
  | TruncateFormatSpec
  | PluralizeFormatSpec;

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
 * The instant an ISO-8601 string or an epoch number names (seconds below
 * {@link EPOCH_SECONDS_BELOW}, milliseconds above), with the offset the
 * value states in minutes. An unzoned value is read as UTC and states no
 * offset, so it reads back as written; an epoch number states none either.
 * Fractional seconds beyond three digits are truncated, since `Date.parse`
 * is not required to accept them.
 */
function readDate(value: unknown): { millis: number; offset: number } | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return { millis: Math.abs(value) < EPOCH_SECONDS_BELOW ? value * 1000 : value, offset: 0 };
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
  if (!Number.isFinite(parsed)) return undefined;
  const stated = zone === undefined || zone === "Z" ? undefined : /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
  const offset =
    stated === undefined || stated === null
      ? 0
      : (stated[1] === "-" ? -1 : 1) * (Number(stated[2]) * 60 + Number(stated[3]));
  return { millis: parsed, offset };
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
    if (typeof spec.pattern !== "string") return undefined;
    return { type: "date", pattern: spec.pattern, ...(isDateZone(spec.zone) ? { zone: spec.zone } : {}) };
  }
  const locale =
    typeof spec.locale === "string" && LOCALE_TAG.test(spec.locale) ? spec.locale : undefined;
  const withLocale = locale === undefined ? {} : { locale };
  if (spec.type === "count") return { type: "count", ...withLocale };
  if (spec.type === "join") {
    const bounded = (value: unknown): value is string =>
      typeof value === "string" && value.length <= JOIN_SEPARATOR_MAX;
    return {
      type: "join",
      ...(bounded(spec.separator) ? { separator: spec.separator } : {}),
      ...(bounded(spec.last) ? { last: spec.last } : {}),
      ...(isPlainDottedPath(spec.field) ? { field: spec.field } : {})
    };
  }
  if (spec.type === "truncate") {
    if (
      typeof spec.length !== "number" ||
      !Number.isInteger(spec.length) ||
      spec.length < TRUNCATE_LENGTH_MIN ||
      spec.length > TRUNCATE_LENGTH_MAX
    ) {
      return undefined;
    }
    const ellipsis =
      typeof spec.ellipsis === "string" && spec.ellipsis.length <= TRUNCATE_ELLIPSIS_MAX
        ? spec.ellipsis
        : undefined;
    return { type: "truncate", length: spec.length, ...(ellipsis === undefined ? {} : { ellipsis }) };
  }
  if (spec.type === "pluralize") {
    if (!isPlainObject(spec.forms)) return undefined;
    const forms: Partial<Record<PluralCategory, string>> = {};
    for (const category of PLURAL_CATEGORIES) {
      const form = spec.forms[category];
      if (typeof form === "string" && form.length <= PLURAL_FORM_MAX) forms[category] = form;
    }
    const other = forms.other;
    if (other === undefined) return undefined;
    return { type: "pluralize", forms: { ...forms, other }, ...withLocale };
  }
  const decimals =
    typeof spec.decimals === "number" &&
    Number.isInteger(spec.decimals) &&
    spec.decimals >= FORMAT_DECIMALS_MIN &&
    spec.decimals <= FORMAT_DECIMALS_MAX
      ? spec.decimals
      : undefined;
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
  if (spec.type === "join") return joinFormatter(spec);
  if (spec.type === "truncate") return truncateFormatter(spec);
  if (spec.type === "count" || spec.type === "pluralize") {
    const grouped = groupedNumber(spec.locale ?? DEFAULT_FORMAT_LOCALE);
    if (grouped === undefined) return plain;
    if (spec.type === "count") {
      return (value) => (Array.isArray(value) ? grouped(value.length) : plain(value));
    }
    return pluralizeFormatter(spec, grouped);
  }
  if (spec.type === "date") {
    const parts = tokenizeDatePattern(spec.pattern);
    if (parts === undefined) return plain;
    // `value` reads the clock the value states; `utc` and `viewer` read
    // UTC (the frame rewrites a viewer-zone date from its marked instant).
    const stated = spec.zone === "value";
    return (value) => {
      const read = readDate(value);
      if (read === undefined) return plain(value);
      return formatDate(stated ? read.millis + read.offset * 60_000 : read.millis, parts);
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

/** A number grouped in `locale` with ordinary spaces, or `undefined` when the engine refuses the locale. */
function groupedNumber(locale: string): ((value: number) => string) | undefined {
  try {
    const intl = new Intl.NumberFormat(locale);
    return (value) => intl.format(value).replace(UNICODE_SPACES, " ");
  } catch {
    return undefined;
  }
}

/** The plain text at `field`'s segments inside `item`, or of the item itself. */
function itemText(item: unknown, segments: readonly string[] | undefined): string {
  let current = item;
  if (segments !== undefined && isPlainObject(item)) {
    for (const segment of segments) {
      if (Array.isArray(current)) {
        const index = Number(segment);
        current = Number.isInteger(index) ? current[index] : undefined;
      } else if (isPlainObject(current)) {
        current = current[segment];
      } else {
        current = undefined;
      }
    }
  }
  // An absent or null item is no item: sparse data never reads ", ,".
  return current === null || current === undefined ? "" : formatValue(current);
}

function joinFormatter(spec: JoinFormatSpec): Formatter {
  const separator = spec.separator ?? JOIN_DEFAULT_SEPARATOR;
  const segments = spec.field === undefined ? undefined : spec.field.split(".");
  return (value) => {
    if (!Array.isArray(value)) return plain(value);
    const texts = value.map((item) => itemText(item, segments)).filter((text) => text !== "");
    if (spec.last === undefined || texts.length < 2) return texts.join(separator);
    return texts.slice(0, -1).join(separator) + spec.last + (texts[texts.length - 1] as string);
  };
}

function truncateFormatter(spec: TruncateFormatSpec): Formatter {
  const ellipsis = spec.ellipsis ?? TRUNCATE_DEFAULT_ELLIPSIS;
  return (value) => {
    const text = formatValue(value);
    // Code points, so a surrogate pair is never split.
    const points = Array.from(text);
    if (points.length <= spec.length) return text;
    return points.slice(0, spec.length).join("").trimEnd() + ellipsis;
  };
}

function pluralizeFormatter(spec: PluralizeFormatSpec, grouped: (value: number) => string): Formatter {
  let rules: Intl.PluralRules;
  try {
    rules = new Intl.PluralRules(spec.locale ?? DEFAULT_FORMAT_LOCALE);
  } catch {
    return plain;
  }
  return (value) => {
    const count = Array.isArray(value) ? value.length : toFiniteNumber(value);
    if (count === undefined) return plain(value);
    // An author's `zero` form reads "No items" in every locale; the locale's
    // own rules choose otherwise.
    const category = count === 0 && spec.forms.zero !== undefined ? "zero" : rules.select(count);
    const form = (isPluralCategory(category) ? spec.forms[category] : undefined) ?? spec.forms.other;
    return form.split(PLURAL_COUNT_PLACEHOLDER).join(grouped(count));
  };
}

/**
 * Formatters keyed by the spec OBJECT, which lives as long as the compiled
 * template that carries it. Holds author literals and locale/currency configuration only —
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

/**
 * A viewer-zone date as the renderer marks it for the frame: the instant
 * (ISO-8601 UTC), the pattern and the UTC text every other surface shows.
 * `undefined` when `spec` is not a viewer-zone date or the value does not
 * parse — it then renders as plain text, with nothing for the frame to
 * rewrite.
 */
export function viewerDate(
  value: unknown,
  spec: unknown
): { datetime: string; pattern: string; text: string } | undefined {
  const parsed = parseFormatSpec(spec);
  if (parsed === undefined || parsed.type !== "date" || parsed.zone !== "viewer") return undefined;
  const parts = tokenizeDatePattern(parsed.pattern);
  const read = readDate(value);
  if (parts === undefined || read === undefined) return undefined;
  const at = new Date(read.millis);
  if (!Number.isFinite(at.getTime())) return undefined;
  return { datetime: at.toISOString(), pattern: parsed.pattern, text: formatDate(read.millis, parts) };
}

/** Render `value` through `spec`, or as plain text when it cannot be parsed. */
export function formatBoundValue(value: unknown, spec: unknown): string {
  return compileFormat(spec)(value);
}
