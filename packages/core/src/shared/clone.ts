/** Structural copy of JSON-shaped data; the designers hand out copies, never their state. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
