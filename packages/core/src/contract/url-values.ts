/**
 * The URL-value rule: how a data value is composed behind an author's URL
 * prefix (a template `prefix`, a `hints.links` prefix string) so that no
 * character of the value can change the URL's structure. The prefix alone
 * decides how the value is read — data never chooses its own treatment:
 *
 * - exactly `http:` / `https:`: the value is the rest of a URL, so only the
 *   characters a browser encodes in a whole URL are encoded (`%` and the
 *   delimiters stay, the value's own escapes included);
 * - any other bare scheme (`mailto:`, `tel:`): the value is the scheme's
 *   address — `@`, `+` and the sub-delimiters stay, `%`, `?`, `#`, `&` and
 *   everything else is encoded;
 * - anything longer: the value is one URI component (`encodeURIComponent`).
 *
 * Runtime-neutral: no `URL` global, so every host composes alike. The app
 * template's preview carries a copy, pinned by an agreement test.
 */

const WEB_SCHEME = /^https?:$/i;
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
  const unsafe = WEB_SCHEME.test(prefix)
    ? URL_UNSAFE
    : BARE_SCHEME.test(prefix)
      ? ADDRESS_UNSAFE
      : COMPONENT_UNSAFE;
  return prefix + value.replace(unsafe, encodeCodePoint);
}
