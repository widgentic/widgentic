import type { WebMcpTool, WebMcpToolResult } from "../types.js";

export function host(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

/** The JSON document every tool result carries. */
export function payload(result: WebMcpToolResult): Record<string, unknown> {
  const first = result.content[0];
  if (first === undefined) throw new Error("empty result");
  expect(first.type).toBe("text");
  return JSON.parse(first.text) as Record<string, unknown>;
}

export function tool(tools: readonly WebMcpTool[], name: string): WebMcpTool {
  const found = tools.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`no tool ${name}: ${tools.map((t) => t.name).join(", ")}`);
  return found;
}

export async function run(tools: readonly WebMcpTool[], name: string, input: unknown = {}): Promise<Record<string, unknown>> {
  return payload(await tool(tools, name).execute(input));
}

import { expect } from "vitest";
