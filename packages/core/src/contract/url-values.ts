/**
 * The URL-value rule: how a data value is composed behind an author's URL
 * prefix (a template `prefix`, a `hints.links` prefix string). The prefix
 * alone decides how the value is read — data never chooses its own
 * treatment:
 *
 * - `http:` / `https:`, with or without `//`: the value is the rest of a
 *   URL. Only the characters the `URL_UNSAFE` set names are encoded; `%`
 *   and every delimiter stay, so the value chooses the host and query, as
 *   a whole bound URL does.
 * - a `data:` prefix: the value is kept as written. The URL guard admits
 *   only a base64 image source, whose alphabet needs no encoding.
 * - any other bare scheme (`mailto:`, `tel:`): the value is the scheme's
 *   address. Letters, digits and `-._~@+:;,=!$'()/*` stay; everything else
 *   (`%`, `?`, `#`, `&` among it) is encoded, so the value cannot add
 *   header fields or a fragment.
 * - anything longer (`…?seed=`, `…/u/`): the value is one URI component
 *   (`encodeURIComponent`), so it cannot add parameters, a fragment or a
 *   path segment.
 *
 * Runtime-neutral: no `URL` global, so every host composes alike. The app
 * template's preview carries a copy, pinned by an agreement test.
 */

/** The rule as agents and authors read it, derived by every surface that documents a prefix. */
export const PREFIX_ENCODING_RULE =
  "The value is composed by the prefix's shape: behind a query or path prefix (…?seed=) it is percent-encoded " +
  "as one URI component, so it cannot add parameters or a fragment; behind a bare mailto:/tel: it stays an " +
  "address, with ?, #, & and spaces encoded; behind http:/https: (with or without //) it is the rest of the URL " +
  "and keeps its delimiters; behind a data: prefix it is kept as written. Pass raw values, never pre-encoded ones.";

const WEB_SCHEME = /^https?:(\/\/)?$/i;
const DATA_SCHEME = /^data:/i;
const BARE_SCHEME = /^[a-z][a-z0-9+.-]*:$/i;
const URL_UNSAFE = /[\u0000- \u007f"<>\\^`{|}]|[^\u0000-\u007f]/gu;
const ADDRESS_UNSAFE = /[^A-Za-z0-9\-._~@+:;,=!$'()*/]/gu;
const COMPONENT_UNSAFE = /[^A-Za-z0-9\-_.!~*'()]/gu;

/** UTF-8 percent-encoding of one code point; a lone surrogate encodes as U+FFFD, as URL parsers do. */
function encodeCodePoint(char: string): string {
  try {
    return encodeURIComponent(char);
  } catch {
    return "%EF%BF%BD";
  }
}

/** The author prefix followed by the value, encoded by the URL-value rule. */
export function composePrefixedUrl(prefix: string, value: string): string {
  if (DATA_SCHEME.test(prefix)) return prefix + value;
  const unsafe = WEB_SCHEME.test(prefix)
    ? URL_UNSAFE
    : BARE_SCHEME.test(prefix)
      ? ADDRESS_UNSAFE
      : COMPONENT_UNSAFE;
  return prefix + value.replace(unsafe, encodeCodePoint);
}
