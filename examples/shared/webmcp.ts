/**
 * The WebMCP host wiring the example hosts share: designer SOURCES that open
 * the designer's section before returning its live handle (so "the agent
 * asked for the theme designer" surfaces it to the person too), and the one
 * status sentence both pages show. Each example still makes its own
 * `exposeDesigners` call at its own boot, because that is what a reader came
 * to read.
 */
import type {
  ActionDesignerHandle,
  DesignerHandle,
  SchemaDesignerHandle,
  ThemeDesignerHandle
} from "@widgentic/designer";
import type { DesignerSources, RegisterResult } from "@widgentic/webmcp";

export type DesignerKind = "widget" | "theme" | "schema" | "action";

export interface DesignerSourceHost {
  /** Bring the designer's section on screen; may (re)mount it. */
  show(kind: DesignerKind): void;
  /** The current handles — read AFTER `show`, since showing may remount. */
  current: {
    widget?: () => DesignerHandle | undefined;
    theme?: () => ThemeDesignerHandle | undefined;
    schema?: () => SchemaDesignerHandle | undefined;
    action?: () => ActionDesignerHandle | undefined;
  };
}

export function designerSources(host: DesignerSourceHost): DesignerSources {
  const { widget, theme, schema, action } = host.current;
  return {
    ...(widget === undefined ? {} : { widget: () => { host.show("widget"); return widget(); } }),
    ...(theme === undefined ? {} : { theme: () => { host.show("theme"); return theme(); } }),
    ...(schema === undefined ? {} : { schema: () => { host.show("schema"); return schema(); } }),
    ...(action === undefined ? {} : { action: () => { host.show("action"); return action(); } })
  };
}

/**
 * What a page tells the person about its agent tools: a sentence ONLY when an
 * agent-capable browser registered them — everyone else sees nothing and
 * the page is unchanged. (A "no agent-capable browser" line read as a
 * fault to people who had never heard of WebMCP.)
 */
export function describeAgentTools(result: RegisterResult): string {
  if (!result.supported || result.registered.length === 0) return "";
  const refused = result.failed.length === 0 ? "" : ` (${result.failed.length} refused)`;
  return `WebMCP tools are available in this browser${refused} — your agent can draft into these designers; you save.`;
}
