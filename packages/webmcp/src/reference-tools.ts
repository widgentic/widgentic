/** Tools that need no designer: reference data derived from the exported specs at call time. */
import { TOKEN_SPECS } from "@widgentic/core";
import { okResult } from "./result.js";
import { defineTool, objectSchema } from "./tool.js";
import type { NameOf } from "./tool.js";
import type { WebMcpTool } from "./types.js";

export function themeTokenSpecsTool(name: NameOf): WebMcpTool {
  return defineTool({
    name: name("theme_token_specs"),
    title: "List the theme tokens",
    readOnly: true,
    description:
      "List every --wg-* theme token with its value type, default, purpose and fallback token — the vocabulary for theme entries and preview themes. Author-defined variables are x-<name>.",
    inputSchema: objectSchema({}),
    execute() {
      const tokens = Object.entries(TOKEN_SPECS).map(([token, spec]) => ({
        name: token,
        type: spec.type,
        default: spec.default,
        use: spec.use,
        ...("fallback" in spec && spec.fallback !== undefined ? { fallback: spec.fallback } : {})
      }));
      return okResult({ tokens });
    }
  });
}
