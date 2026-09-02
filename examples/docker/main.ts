/**
 * The self-hosted authoring client: the four designers over the authoring
 * surface, plus write-only secrets and API keys. Deliberately plainer than
 * widgentic.dev's app — one list and one designer per tab — while covering
 * the same authoring capability: list, create, open read-only, edit, save,
 * delete, test an action, write a secret, mint and revoke a key.
 *
 * Wiring comes from the shared example module (mount discipline, typed API
 * client); everything on this page is the demo a reader copies.
 */
import type { StoredAction, ThemeEntry } from "@widgentic/core";
import type {
  ActionDesignerHandle,
  ActionEntry,
  DesignerHandle,
  SchemaDesignerHandle,
  SchemaEntry,
  ThemeDesignerHandle
} from "@widgentic/designer";
import type { HttpActionDefinition } from "@widgentic/core";
import { authoringClient as api, AuthoringApiError } from "@widgentic-examples/shared/client";
import type { KeyEntry, SecretEntry, WidgetEntry } from "@widgentic-examples/shared/client";
import { mountAction, mountSchema, mountTheme, mountWidget, previewThemes } from "@widgentic-examples/shared/designers";
import { describeAgentTools, designerSources } from "@widgentic-examples/shared/webmcp";
import { exposeDesigners } from "@widgentic/webmcp";
import { invoiceWidget } from "@widgentic-examples/mcp-server/widgets";

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
}

const statusEl = $("status");
function status(text: string, kind: "info" | "error" = "info"): void {
  statusEl.textContent = text;
  statusEl.className = kind === "error" ? "error" : "";
}

/** Run an API call, surfacing the store's own rule on refusal. */
async function attempt<T>(work: () => Promise<T>): Promise<T | undefined> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AuthoringApiError) status(`${error.code}: ${error.message}`, "error");
    else status(String(error), "error");
    return undefined;
  }
}

type Mode = "new" | "viewing" | "editing";

let myWidgets: WidgetEntry[] = [];
let myThemes: ThemeEntry[] = [];
let mySchemas: SchemaEntry[] = [];
let myActions: StoredAction[] = [];
let mySecrets: SecretEntry[] = [];
let secretsEnabled = false;



/** A generic list pane: rows open read-only; Edit and Delete act per row. */
function renderList(
  listId: string,
  names: string[],
  selected: string | undefined,
  emptyText: string,
  onOpen: (name: string) => void,
  onEdit: (name: string) => void,
  onRemove: (name: string) => void
): void {
  const list = $(listId);
  list.replaceChildren();
  if (names.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = emptyText;
    list.append(empty);
    return;
  }
  for (const name of names) {
    const row = document.createElement("div");
    row.className = name === selected ? "row selected" : "row";
    const label = document.createElement("span");
    label.className = "name";
    label.textContent = name;
    label.addEventListener("click", () => onOpen(name));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => onEdit(name));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => onRemove(name));
    row.append(label, edit, remove);
    list.append(row);
  }
}

/* ------------------------------- widgets ------------------------------- */

let widgetDesigner: DesignerHandle | undefined;
let widgetMode: Mode = "new";
let selectedWidget: string | undefined;

function openWidgetDesigner(load?: unknown, readOnly = false): void {
  widgetDesigner = mountWidget($("widget-designer"), widgetDesigner, {
    themes: previewThemes(myThemes),
    schemas: mySchemas,
    actions: myActions,
    secretNames: mySecrets.map((s) => s.name),
    readOnly
  });
  if (load !== undefined) {
    const result = widgetDesigner.loadWidget(load);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`, "error");
  }
}

function showWidgets(): void {
  renderList(
    "widget-list",
    myWidgets.map((w) => w.kind),
    selectedWidget,
    "Nothing yet — design a widget and save it.",
    (kind) => {
      selectedWidget = kind;
      widgetMode = "viewing";
      openWidgetDesigner(myWidgets.find((w) => w.kind === kind), true);
      showWidgets();
    },
    (kind) => {
      selectedWidget = kind;
      widgetMode = "editing";
      openWidgetDesigner(myWidgets.find((w) => w.kind === kind));
      showWidgets();
    },
    (kind) => {
      void attempt(() => api.removeWidget(kind)).then(async (done) => {
        if (done === undefined) return;
        status(`removed ${kind}`);
        await refreshWidgets();
      });
    }
  );
  $("widget-save").hidden = widgetMode === "viewing";
}

async function refreshWidgets(): Promise<void> {
  myWidgets = (await attempt(() => api.listWidgets())) ?? myWidgets;
  showWidgets();
}

async function saveWidget(): Promise<void> {
  if (widgetDesigner === undefined) return;
  const draft = widgetDesigner.getDraft();
  const saved = await attempt(() =>
    api.saveWidget({
      kind: draft.kind,
      template: draft.template,
      descriptor: draft.descriptor,
      ...(draft.load === undefined ? {} : { load: draft.load })
    } as WidgetEntry)
  );
  if (saved === undefined) return;
  selectedWidget = draft.kind;
  widgetMode = "viewing";
  await refreshWidgets();
  openWidgetDesigner(myWidgets.find((w) => w.kind === draft.kind), true);
  status(`saved ${draft.kind} — it is in your MCP catalog now`);
}

/* -------------------------------- themes -------------------------------- */

let themeDesigner: ThemeDesignerHandle | undefined;
let themeMode: Mode = "new";
let selectedTheme: string | undefined;

function openThemeDesigner(load?: unknown, readOnly = false): void {
  // The principal's own widgets join the preview-kind selector: a theme is
  // judged against the widgets it will actually dress.
  themeDesigner = mountTheme($("theme-designer"), themeDesigner, { widgets: myWidgets, readOnly });
  if (load !== undefined) {
    const result = themeDesigner.loadTheme(load);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`, "error");
  }
}

function showThemes(): void {
  renderList(
    "theme-list",
    myThemes.map((t) => t.name),
    selectedTheme,
    "Nothing yet — design a theme and save it.",
    (name) => {
      selectedTheme = name;
      themeMode = "viewing";
      openThemeDesigner(myThemes.find((t) => t.name === name), true);
      showThemes();
    },
    (name) => {
      selectedTheme = name;
      themeMode = "editing";
      openThemeDesigner(myThemes.find((t) => t.name === name));
      showThemes();
    },
    (name) => {
      void attempt(() => api.removeTheme(name)).then(async (done) => {
        if (done === undefined) return;
        status(`removed ${name}`);
        await refreshThemes();
      });
    }
  );
  $("theme-save").hidden = themeMode === "viewing";
}

async function refreshThemes(): Promise<void> {
  myThemes = (await attempt(() => api.listThemes())) ?? myThemes;
  showThemes();
}

async function saveTheme(): Promise<void> {
  if (themeDesigner === undefined) return;
  const entry = themeDesigner.getTheme();
  const saved = await attempt(() => api.saveTheme(entry));
  if (saved === undefined) return;
  selectedTheme = entry.name;
  themeMode = "viewing";
  await refreshThemes();
  openThemeDesigner(myThemes.find((t) => t.name === entry.name), true);
  status(`saved theme ${entry.name}`);
}

/* -------------------------------- schemas ------------------------------- */

let schemaDesigner: SchemaDesignerHandle | undefined;
let schemaMode: Mode = "new";
let selectedSchema: string | undefined;

function openSchemaDesigner(load?: unknown, readOnly = false): void {
  schemaDesigner = mountSchema($("schema-designer"), schemaDesigner, { readOnly });
  if (load !== undefined) {
    const result = schemaDesigner.loadSchema(load);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`, "error");
  }
}

function showSchemas(): void {
  renderList(
    "schema-list",
    mySchemas.map((s) => s.name),
    selectedSchema,
    "Nothing yet — one schema can serve many widgets.",
    (name) => {
      selectedSchema = name;
      schemaMode = "viewing";
      openSchemaDesigner(mySchemas.find((s) => s.name === name), true);
      showSchemas();
    },
    (name) => {
      selectedSchema = name;
      schemaMode = "editing";
      openSchemaDesigner(mySchemas.find((s) => s.name === name));
      showSchemas();
    },
    (name) => {
      void attempt(() => api.removeSchema(name)).then(async (done) => {
        if (done === undefined) return;
        status(`removed ${name}`);
        await refreshSchemas();
      });
    }
  );
  $("schema-save").hidden = schemaMode === "viewing";
}

async function refreshSchemas(): Promise<void> {
  mySchemas = (await attempt(() => api.listSchemas())) ?? mySchemas;
  showSchemas();
}

async function saveSchema(): Promise<void> {
  if (schemaDesigner === undefined) return;
  const entry = schemaDesigner.getSchema();
  const saved = await attempt(() => api.saveSchema(entry));
  if (saved === undefined) return;
  selectedSchema = entry.name;
  schemaMode = "viewing";
  await refreshSchemas();
  openSchemaDesigner(mySchemas.find((s) => s.name === entry.name), true);
  status(`saved schema ${entry.name} — widgets can reference it now`);
}

/* -------------------------------- actions ------------------------------- */

let actionDesigner: ActionDesignerHandle | undefined;
let actionMode: Mode = "new";
let selectedAction: string | undefined;

/** The designer's Test control runs the PRODUCTION execute path server-side. */
async function testCall(definition: HttpActionDefinition, args: Record<string, unknown>): Promise<unknown> {
  const result = await api.testAction(definition, args);
  status(result.ok ? "test call passed" : `test call failed: ${result.code ?? ""} ${result.message ?? ""}`.trim(), result.ok ? "info" : "error");
  return result;
}

function openActionDesigner(load?: unknown, readOnly = false): void {
  actionDesigner = mountAction($("action-designer"), actionDesigner, {
    schemas: mySchemas,
    secretNames: mySecrets.map((s) => s.name),
    testCall,
    readOnly
  });
  if (load !== undefined) {
    const result = actionDesigner.loadAction(load);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`, "error");
  }
}

function showActions(): void {
  renderList(
    "action-list",
    myActions.map((a) => a.name),
    selectedAction,
    "Nothing yet — a shared action can serve many widgets.",
    (name) => {
      selectedAction = name;
      actionMode = "viewing";
      openActionDesigner(myActions.find((a) => a.name === name), true);
      showActions();
    },
    (name) => {
      selectedAction = name;
      actionMode = "editing";
      openActionDesigner(myActions.find((a) => a.name === name));
      showActions();
    },
    (name) => {
      void attempt(() => api.removeAction(name)).then(async (done) => {
        if (done === undefined) return;
        status(`removed ${name}`);
        await refreshActions();
      });
    }
  );
  $("action-save").hidden = actionMode === "viewing";
}

async function refreshActions(): Promise<void> {
  myActions = (await attempt(() => api.listActions())) ?? myActions;
  showActions();
}

async function saveAction(): Promise<void> {
  if (actionDesigner === undefined) return;
  const entry: ActionEntry = actionDesigner.getAction();
  const saved = await attempt(() => api.saveAction(entry as StoredAction));
  if (saved === undefined) return;
  selectedAction = entry.name;
  actionMode = "viewing";
  await refreshActions();
  openActionDesigner(myActions.find((a) => a.name === entry.name), true);
  status(`saved action ${entry.name} — widgets can bind it now`);
}

/* -------------------------------- secrets ------------------------------- */

function showSecrets(): void {
  $<HTMLInputElement>("secret-name").disabled = !secretsEnabled;
  $<HTMLInputElement>("secret-value").disabled = !secretsEnabled;
  $<HTMLButtonElement>("secret-save").disabled = !secretsEnabled;
  if (!secretsEnabled) {
    $("secrets-note").textContent =
      "Secrets are unavailable: this deployment has no KEK configured (WIDGENTIC_KEK_FILE or WIDGENTIC_KEK). Everything else works.";
  }
  renderList(
    "secret-list",
    mySecrets.map((s) => s.name),
    undefined,
    secretsEnabled ? "No secrets yet." : "",
    () => status("secrets are write-only — there is nothing to open"),
    () => status("secrets are write-only — save under the same name to replace the value"),
    (name) => {
      void attempt(() => api.removeSecret(name)).then(async (done) => {
        if (done === undefined) return;
        status(`removed ${name}`);
        await refreshSecrets();
      });
    }
  );
}

async function refreshSecrets(): Promise<void> {
  const listing = await attempt(() => api.listSecrets());
  if (listing !== undefined) {
    secretsEnabled = listing.enabled;
    mySecrets = listing.secrets;
  }
  showSecrets();
}

/* --------------------------------- keys --------------------------------- */

let myKeys: KeyEntry[] = [];

function showKeys(): void {
  const list = $("key-list");
  list.replaceChildren();
  if (myKeys.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No keys yet — create one and add it to your MCP host.";
    list.append(empty);
    return;
  }
  for (const key of myKeys) {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.className = "name";
    label.textContent = `${key.name} · ${key.scopes.join(", ")} · ${key.digestPreview}…${key.revokedAt !== undefined ? " · revoked" : ""}`;
    row.append(label);
    if (key.revokedAt === undefined) {
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.className = "danger";
      revoke.textContent = "Revoke";
      revoke.addEventListener("click", () => {
        void attempt(() => api.revokeKey(key.id)).then(async (done) => {
          if (done === undefined) return;
          status(`revoked ${key.name}`);
          await refreshKeys();
        });
      });
      row.append(revoke);
    }
    list.append(row);
  }
}

async function refreshKeys(): Promise<void> {
  myKeys = (await attempt(() => api.listKeys())) ?? myKeys;
  showKeys();
}

async function createKey(): Promise<void> {
  const name = $<HTMLInputElement>("key-name").value.trim();
  const execute = $<HTMLInputElement>("key-execute").checked;
  const created = await attempt(() => api.createKey(name, execute ? ["read", "execute"] : undefined));
  if (created === undefined) return;
  const reveal = $("key-reveal");
  reveal.hidden = false;
  reveal.textContent = `${created.key} — ${created.notice}`;
  $<HTMLInputElement>("key-name").value = "";
  await refreshKeys();
}

/* ---------------------------------- tabs --------------------------------- */

const SECTIONS = ["widgets", "themes", "schemas", "actions", "secrets", "keys"] as const;

function showTab(name: (typeof SECTIONS)[number]): void {
  for (const section of SECTIONS) {
    $(`pane-${section}`).hidden = section !== name;
    $(`tab-${section}`).classList.toggle("active", section === name);
  }
  // Re-mount the widget designer when returning to it, so themes, schemas,
  // actions and secrets saved meanwhile appear in its selectors — carrying
  // the in-progress draft, which must survive a trip to the Schemas tab
  // (the store itself forces that trip for a dangling schema ref).
  if (name === "widgets" && widgetMode === "new") openWidgetDesigner(widgetDesigner?.getDraft());
}

for (const section of SECTIONS) {
  $(`tab-${section}`).addEventListener("click", () => showTab(section));
}

$("widget-new").addEventListener("click", () => {
  selectedWidget = undefined;
  widgetMode = "new";
  openWidgetDesigner();
  showWidgets();
});
$("widget-example").addEventListener("click", () => {
  selectedWidget = undefined;
  widgetMode = "new";
  openWidgetDesigner(invoiceWidget);
  showWidgets();
  status("loaded the invoice example — rename the kind and save");
});
$("widget-save").addEventListener("click", () => void saveWidget());
$("theme-new").addEventListener("click", () => {
  selectedTheme = undefined;
  themeMode = "new";
  openThemeDesigner();
  showThemes();
});
$("theme-save").addEventListener("click", () => void saveTheme());
$("schema-new").addEventListener("click", () => {
  selectedSchema = undefined;
  schemaMode = "new";
  openSchemaDesigner();
  showSchemas();
});
$("schema-save").addEventListener("click", () => void saveSchema());
$("action-new").addEventListener("click", () => {
  selectedAction = undefined;
  actionMode = "new";
  openActionDesigner();
  showActions();
});
$("action-save").addEventListener("click", () => void saveAction());
$("secret-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $<HTMLInputElement>("secret-name").value.trim();
  const value = $<HTMLInputElement>("secret-value").value;
  void attempt(() => api.saveSecret(name, value)).then(async (done) => {
    if (done === undefined) return;
    $<HTMLInputElement>("secret-name").value = "";
    $<HTMLInputElement>("secret-value").value = "";
    status(`saved secret ${name} — reference it from an http action; it is never shown again`);
    await refreshSecrets();
  });
});
$("key-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void createKey();
});

/* ---------------------------------- boot --------------------------------- */

async function boot(): Promise<void> {
  const me = await attempt(() => api.me());
  if (me !== undefined) secretsEnabled = me.secretsEnabled;
  await Promise.all([refreshWidgets(), refreshThemes(), refreshSchemas(), refreshActions(), refreshSecrets(), refreshKeys()]);
  openThemeDesigner();
  openSchemaDesigner();
  openActionDesigner();
  showTab("widgets"); // mounts the widget designer — the one place that does
  status("ready — everything you save is served on the MCP endpoint immediately");

  // The designers as WebMCP tools: a browser-side agent (ChatGPT Desktop's
  // browser, Chrome in the origin trial) reads and edits the drafts on this
  // page; every source opens its section first so the person sees what the
  // agent is doing. Saving stays the person's — no tool here persists.
  const agentTools = await exposeDesigners(
    designerSources({
      show: (kind) => showTab(`${kind}s`),
      current: {
        widget: () => widgetDesigner,
        theme: () => themeDesigner,
        schema: () => schemaDesigner,
        action: () => actionDesigner
      }
    })
  );
  $("agent-status").textContent = describeAgentTools(agentTools);
}

void boot();
