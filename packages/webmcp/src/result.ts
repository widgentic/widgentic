/**
 * Tool results: one JSON document inside MCP text content, always with a
 * boolean `ok`. Refusals are results, never rejections — a thrown error reaches
 * the agent as an opaque failure, a result is something it can act on.
 */
import { isPlainObject } from "@widgentic/core";
import type { WebMcpToolResult } from "./types.js";

export type FailureCode = "NOT_MOUNTED" | "INVALID_INPUT" | "REJECTED";

function textResult(payload: Record<string, unknown>): WebMcpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

export function okResult(payload: Record<string, unknown> = {}): WebMcpToolResult {
  return textResult({ ok: true, ...payload });
}

export function failResult(code: FailureCode, detail: Record<string, unknown> = {}): WebMcpToolResult {
  return textResult({ ok: false, code, ...detail });
}

/** The arguments object, or an empty one when the agent sent nothing usable. */
export function argumentsOf(input: unknown): Record<string, unknown> {
  return isPlainObject(input) ? input : {};
}

export function invalidArgument(argument: string, expected: string): WebMcpToolResult {
  return failResult("INVALID_INPUT", { argument, expected });
}

export function notMounted(designer: "widget" | "theme" | "schema" | "action"): WebMcpToolResult {
  return failResult("NOT_MOUNTED", {
    designer,
    message: `The ${designer} designer is not mounted on this page right now.`
  });
}

export function rejected(errors: readonly string[]): WebMcpToolResult {
  return failResult("REJECTED", { errors: [...errors] });
}
