/**
 * Registration on the page's model context. Feature-detected (the spec's
 * `document.modelContext`, then Chrome's `navigator.modelContext`), reported
 * rather than thrown, disposable as one unit through a single abort signal.
 */
import { designerTools } from "./tools.js";
import type {
  DesignerSources,
  ExposeOptions,
  ExposeResult,
  ModelContextLike,
  RegisterFailure,
  RegisterOptions,
  RegisterResult,
  WebMcpTool
} from "./types.js";

function isModelContext(value: unknown): value is ModelContextLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { registerTool?: unknown }).registerTool === "function"
  );
}

/** The page's model context: the document's (spec, ChatGPT) before the navigator's (Chrome origin trial). */
export function resolveModelContext(): ModelContextLike | undefined {
  const scope = globalThis as {
    document?: { modelContext?: unknown };
    navigator?: { modelContext?: unknown };
  };
  const fromDocument = scope.document?.modelContext;
  if (isModelContext(fromDocument)) return fromDocument;
  const fromNavigator = scope.navigator?.modelContext;
  if (isModelContext(fromNavigator)) return fromNavigator;
  return undefined;
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

const UNSUPPORTED: RegisterResult = { supported: false, registered: [], failed: [], dispose() {} };

export async function registerTools(tools: readonly WebMcpTool[], options: RegisterOptions = {}): Promise<RegisterResult> {
  const context = options.modelContext ?? resolveModelContext();
  if (context === undefined) return UNSUPPORTED;

  const controller = new AbortController();
  const registered: string[] = [];
  const failed: RegisterFailure[] = [];
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    if (typeof context.unregisterTool !== "function") return;
    for (const name of registered) {
      try {
        context.unregisterTool(name);
      } catch {
        // Already gone (the abort did it) — nothing to report.
      }
    }
  };
  if (options.signal !== undefined) {
    if (options.signal.aborted) dispose();
    else options.signal.addEventListener("abort", dispose, { once: true });
  }

  // One rejection (a duplicate name, a permissions-policy refusal) must not
  // take the others down: settle them all, report by name.
  const outcomes = await Promise.allSettled(
    tools.map(async (tool) => {
      await context.registerTool(tool, { signal: controller.signal });
      return tool.name;
    })
  );
  outcomes.forEach((outcome, index) => {
    const name = tools[index]?.name ?? "";
    if (outcome.status === "fulfilled") registered.push(name);
    else failed.push({ name, message: messageOf(outcome.reason) });
  });
  return { supported: true, registered, failed, dispose };
}

/** The one call a host makes after mounting: build the designer tools and register them. */
export async function exposeDesigners(sources: DesignerSources, options: ExposeOptions = {}): Promise<ExposeResult> {
  const tools = [
    ...designerTools(sources, options.prefix === undefined ? {} : { prefix: options.prefix }),
    ...(options.tools ?? [])
  ];
  const result = await registerTools(tools, {
    ...(options.modelContext === undefined ? {} : { modelContext: options.modelContext }),
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
  return { ...result, tools };
}
