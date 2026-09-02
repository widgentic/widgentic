/**
 * The descriptor factory: pure, no browser API — hosts and tests inspect the
 * tools before anything is registered. Only designers with a source get tools;
 * the token reference tool is always present.
 */
import { actionTools, schemaTools, themeTools } from "./entry-tools.js";
import { themeTokenSpecsTool } from "./reference-tools.js";
import type { NameOf } from "./tool.js";
import type { DesignerSources, ToolsOptions, WebMcpTool } from "./types.js";
import { widgetTools } from "./widget-tools.js";

export const DEFAULT_PREFIX = "widgentic";
/** Prefixes are identifiers: a host namespaces its tools, it does not encode data in them. */
const PREFIX = /^[a-z][a-z0-9_]{0,31}$/;

export function designerTools(sources: DesignerSources, options: ToolsOptions = {}): WebMcpTool[] {
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  if (!PREFIX.test(prefix)) {
    throw new TypeError(`Tool prefix '${prefix}' must be lowercase letters, digits and underscores, starting with a letter (max 32).`);
  }
  const name: NameOf = (suffix) => `${prefix}_${suffix}`;
  const tools: WebMcpTool[] = [];
  if (sources.widget !== undefined) tools.push(...widgetTools(sources.widget, name));
  if (sources.theme !== undefined) tools.push(...themeTools(sources.theme, name));
  if (sources.schema !== undefined) tools.push(...schemaTools(sources.schema, name));
  if (sources.action !== undefined) tools.push(...actionTools(sources.action, name));
  tools.push(themeTokenSpecsTool(name));
  return tools;
}
