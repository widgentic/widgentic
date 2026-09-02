/** Descriptor construction shared by every tool module. */
import type { WebMcpTool, WebMcpToolResult } from "./types.js";

export type NameOf = (suffix: string) => string;

/** A closed object schema: every accepted argument named, nothing else allowed. */
export function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[] = []
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required: [...required] } : {}),
    additionalProperties: false
  };
}

export interface ToolSpec {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
  execute(input: unknown): WebMcpToolResult | Promise<WebMcpToolResult>;
}

export function defineTool(spec: ToolSpec): WebMcpTool {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.inputSchema,
    ...(spec.readOnly === true ? { annotations: { readOnlyHint: true } } : {}),
    execute: async (input) => spec.execute(input)
  };
}

/** The sentence every editing tool ends with — the boundary agents must hear every time. */
export const PERSON_SAVES = "Nothing is saved by this tool: the person reviews the result in the designer and saves.";
