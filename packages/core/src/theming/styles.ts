/**
 * Theme styles: the shared `.wg-` classes a theme defines for every widget
 * it dresses. Same shape and guards as a widget descriptor's styles — one
 * generator decides what reaches CSS for both.
 */
import { guardedStylesToCss } from "../catalog/styles.js";
import type { WidgetStyles } from "../catalog/styles.js";

/**
 * Generate a theme's style CSS. With `scope` (a caller constant such as
 * `:root[data-theme="dark"]`, never theme data) every selector part is
 * prefixed with `:where(<scope>) `, so the rule applies only inside the
 * scope and weighs what its author wrote. Never throws.
 */
export function themeStylesToCss(styles: WidgetStyles, scope?: string): string {
  return guardedStylesToCss(styles, scope);
}
