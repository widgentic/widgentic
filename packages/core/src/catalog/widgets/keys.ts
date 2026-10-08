import { isPlainObject } from "./format.js";

/**
 * Keys for a sibling list from record identity: every item must be an
 * object whose `id` is a string or a finite number, and the ids must be
 * distinct as strings (`1` and `"1"` collide). Otherwise the list stays
 * unkeyed and the patchers pair it by position.
 */
export function keysFromIds(items: readonly unknown[]): string[] | undefined {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isPlainObject(item)) return undefined;
    const id = item.id;
    let key: string;
    if (typeof id === "string") key = id;
    else if (typeof id === "number" && Number.isFinite(id)) key = String(id);
    else return undefined;
    if (seen.has(key)) return undefined;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}
