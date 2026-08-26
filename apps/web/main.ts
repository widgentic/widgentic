/**
 * The widgentic.dev client: sign-in state, the two designers mounted
 * against the authoring API, and key management. Design-it-is-publish:
 * "Save to my catalog" PUTs through the session, and the entry is in the
 * caller's MCP catalog on the next tool call — no other step exists.
 */
import {
  createActionDesigner,
  createDesigner,
  createSchemaDesigner,
  createThemeDesigner,
  seedThemeEntry,
  seedWidgetDraft
} from "widgentic/designer";
import type { WidgetDraft } from "widgentic/designer";
import type {
  ActionDesignerHandle,
  ActionEntry,
  DesignerHandle,
  SchemaDesignerHandle,
  SchemaEntry,
  ThemeDesignerHandle
} from "widgentic/designer";
import type { HttpActionDefinition } from "widgentic/actions";
import { createThemeRegistry } from "widgentic/theming";
import type { ThemeEntry } from "widgentic/theming";

interface StoredWidgetJson {
  kind: string;
  template: unknown;
  descriptor: unknown;
  load?: unknown;
}

interface SecretEntryJson {
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredSchemaJson {
  name: string;
  label?: string;
  description?: string;
  schema: Record<string, unknown>;
}

interface StoredKeyJson {
  id: string;
  name: string;
  createdAt: string;
  revokedAt?: string;
  scopes: string[];
  digestPreview: string;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

type Tone = "info" | "error" | "pending";

/** The notification banner under the header; errors get the error tone. */
const status = (text: string, tone: Tone = "info"): void => {
  const banner = $("status");
  const label = banner.querySelector(".text");
  if (label) label.textContent = text;
  banner.dataset.tone = tone;
  banner.hidden = text === "";
  banner.setAttribute("role", tone === "error" ? "alert" : "status");
};

/**
 * Run async work with visible feedback: the control that triggered it (the
 * focused button) is disabled with a spinner and the banner shows the
 * pending text until the work settles. Errors surface in the error tone.
 */
async function withBusy<T>(pending: string, work: () => Promise<T>): Promise<T> {
  const control = document.activeElement instanceof HTMLButtonElement ? document.activeElement : undefined;
  if (control) {
    control.disabled = true;
    control.classList.add("busy");
    control.setAttribute("aria-busy", "true");
  }
  status(pending, "pending");
  try {
    return await work();
  } finally {
    if (control) {
      control.disabled = false;
      control.classList.remove("busy");
      control.removeAttribute("aria-busy");
    }
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { error?: { code?: string; message?: string } }
      | undefined;
    const detail = body?.error ? `${body.error.code}: ${body.error.message}` : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

/* ------------------------------ widgets ------------------------------ */

/**
 * Per-list mode: "new" is a fresh editable draft, "viewing" shows a
 * stored entry read-only (Edit/Delete), "editing" edits a stored entry
 * (Save/Cancel; the New and Save-to-my-catalog controls hide until the
 * edit ends).
 */
type ListMode = "new" | "viewing" | "editing";

let widgetDesigner: DesignerHandle | undefined;
let myThemes: ThemeEntry[] = [];
let myWidgets: StoredWidgetJson[] = [];
let mySchemas: StoredSchemaJson[] = [];
let myActions: ActionEntry[] = [];
let mySecrets: SecretEntryJson[] = [];
let secretsEnabled = false;
let selectedKind: string | undefined;
let widgetMode: ListMode = "new";

function designerThemes(): ThemeEntry[] {
  const builtIns = createThemeRegistry().list();
  const names = new Set(builtIns.map((t) => t.name));
  return [...builtIns, ...myThemes.filter((t) => !names.has(t.name))];
}

function mountWidgetDesigner(loadDefinition?: unknown, readOnly = false): void {
  const host = $("widget-designer");
  widgetDesigner?.dispose();
  host.replaceChildren();
  // The principal's shared schemas feed the Data schema section's
  // "use shared" mode; refreshed by the tab-return remount contract.
  // Shared actions and secret names feed element bindings and the
  // widget-level load; the widget designer binds, never authors them.
  widgetDesigner = createDesigner(host, {
    themes: designerThemes(),
    schemas: mySchemas as SchemaEntry[],
    actions: myActions,
    secretNames: mySecrets.map((s) => s.name),
    readOnly
  });
  if (loadDefinition !== undefined) {
    const result = widgetDesigner.loadWidget(loadDefinition);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`, "error");
  }
}

function syncWidgetControls(): void {
  $("widget-new").hidden = widgetMode === "editing";
  $("widget-seed").hidden = widgetMode === "editing";
  // "Save to my catalog" belongs to a NEW draft only — a stored entry
  // saves through its own row, so the top control would be ambiguous.
  $("widget-save").hidden = widgetMode !== "new";
}

function showWidget(widget: StoredWidgetJson, mode: "viewing" | "editing"): void {
  selectedKind = widget.kind;
  widgetMode = mode;
  mountWidgetDesigner(widget, mode === "viewing");
  renderWidgetList();
  syncWidgetControls();
}

function renderWidgetList(): void {
  const list = $("widget-list");
  list.replaceChildren();
  if (myWidgets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Nothing yet — design a widget and save it.";
    list.append(empty);
    return;
  }
  for (const widget of myWidgets) {
    const row = document.createElement("div");
    row.className = "row" + (widget.kind === selectedKind ? " selected" : "");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = widget.kind;
    name.title = "View";
    name.addEventListener("click", () => showWidget(widget, "viewing"));
    const editing = widget.kind === selectedKind && widgetMode === "editing";
    const buttons: HTMLButtonElement[] = [];
    if (editing) {
      const save = document.createElement("button");
      save.textContent = "Save";
      save.className = "primary";
      save.addEventListener("click", () => {
        void saveWidget().catch((error: Error) => status(error.message, "error"));
      });
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => showWidget(widget, "viewing"));
      buttons.push(save, cancel);
    } else {
      const edit = document.createElement("button");
      edit.textContent = "\u270e";
      edit.className = "icon";
      edit.title = "Edit";
      edit.setAttribute("aria-label", "Edit");
      edit.addEventListener("click", () => showWidget(widget, "editing"));
      const base = document.createElement("button");
      base.textContent = "\u29c9";
      base.className = "icon";
      base.title = "Copy — start a new widget as a copy of this one";
      base.setAttribute("aria-label", "Copy");
      base.addEventListener("click", () => {
        // StoredWidgetJson is the store's validated shape; loadWidget
        // re-validates the seed on mount either way.
        startWidgetFrom(
          seedWidgetDraft(widget as unknown as WidgetDraft, myWidgets.map((w) => w.kind))
        );
      });
      const remove = document.createElement("button");
      remove.textContent = "\u2715";
      remove.className = "danger icon";
      remove.title = "Delete";
      remove.setAttribute("aria-label", "Delete");
      remove.addEventListener("click", () => {
        void (async () => {
          await withBusy(`deleting ${widget.kind}…`, () => api(`/api/widgets/${encodeURIComponent(widget.kind)}`, { method: "DELETE" }));
          if (selectedKind === widget.kind) {
            selectedKind = undefined;
            widgetMode = "new";
            mountWidgetDesigner();
            syncWidgetControls();
          }
          await refreshWidgets();
          status(`deleted ${widget.kind}`);
        })().catch((error: Error) => status(error.message, "error"));
      });
      buttons.push(edit, base, remove);
    }
    row.append(name, ...buttons);
    list.append(row);
  }
}

async function refreshWidgets(): Promise<void> {
  myWidgets = (await api<{ widgets: StoredWidgetJson[] }>("/api/widgets")).widgets;
  renderWidgetList();
}

async function saveWidget(): Promise<void> {
  if (widgetDesigner === undefined) return;
  const draft = widgetDesigner.getDraft();
  await withBusy(`saving ${draft.kind}…`, () => api(`/api/widgets/${encodeURIComponent(draft.kind)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      template: draft.template,
      descriptor: draft.descriptor,
      ...(draft.load !== undefined ? { load: draft.load } : {})
    })
  }));
  selectedKind = draft.kind;
  await refreshWidgets();
  // A save ends the edit: back to viewing the stored entry read-only.
  const saved = myWidgets.find((w) => w.kind === draft.kind);
  if (saved !== undefined) showWidget(saved, "viewing");
  status(`saved ${draft.kind} — it is in your MCP catalog now`);
}

/** Open the widget designer in NEW mode with a seeded draft. */
function startWidgetFrom(seed: unknown): void {
  selectedKind = undefined;
  widgetMode = "new";
  mountWidgetDesigner(seed);
  renderWidgetList();
  syncWidgetControls();
}

/* ------------------------------- themes ------------------------------ */

let themeDesigner: ThemeDesignerHandle | undefined;
let selectedTheme: string | undefined;
let themeMode: ListMode = "new";

function mountThemeDesigner(loadEntry?: unknown, readOnly = false): void {
  const host = $("theme-designer");
  themeDesigner?.dispose();
  host.replaceChildren();
  // The principal's own widgets join the preview-kind selector: a theme
  // is judged against the widgets it will actually dress.
  themeDesigner = createThemeDesigner(host, { readOnly, widgets: myWidgets });
  if (loadEntry !== undefined) {
    const result = themeDesigner.loadTheme(loadEntry);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`, "error");
  }
}

function syncThemeControls(): void {
  $("theme-new").hidden = themeMode === "editing";
  $("theme-seed").hidden = themeMode === "editing";
  $("theme-save").hidden = themeMode !== "new";
}

function showTheme(theme: ThemeEntry, mode: "viewing" | "editing"): void {
  selectedTheme = theme.name;
  themeMode = mode;
  mountThemeDesigner(theme, mode === "viewing");
  renderThemeList();
  syncThemeControls();
}

function renderThemeList(): void {
  const list = $("theme-list");
  list.replaceChildren();
  if (myThemes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Nothing yet — design a theme and save it.";
    list.append(empty);
    return;
  }
  for (const theme of myThemes) {
    const row = document.createElement("div");
    row.className = "row" + (theme.name === selectedTheme ? " selected" : "");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = theme.label ?? theme.name;
    name.title = "View";
    name.addEventListener("click", () => showTheme(theme, "viewing"));
    const editing = theme.name === selectedTheme && themeMode === "editing";
    const buttons: HTMLButtonElement[] = [];
    if (editing) {
      const save = document.createElement("button");
      save.textContent = "Save";
      save.className = "primary";
      save.addEventListener("click", () => {
        void saveTheme().catch((error: Error) => status(error.message, "error"));
      });
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => showTheme(theme, "viewing"));
      buttons.push(save, cancel);
    } else {
      const edit = document.createElement("button");
      edit.textContent = "\u270e";
      edit.className = "icon";
      edit.title = "Edit";
      edit.setAttribute("aria-label", "Edit");
      edit.addEventListener("click", () => showTheme(theme, "editing"));
      const base = document.createElement("button");
      base.textContent = "\u29c9";
      base.className = "icon";
      base.title = "Copy — start a new theme as a copy of this one";
      base.setAttribute("aria-label", "Copy");
      base.addEventListener("click", () => {
        startThemeFrom(seedThemeEntry(theme, myThemes.map((t) => t.name)));
      });
      const remove = document.createElement("button");
      remove.textContent = "\u2715";
      remove.className = "danger icon";
      remove.title = "Delete";
      remove.setAttribute("aria-label", "Delete");
      remove.addEventListener("click", () => {
        void (async () => {
          await withBusy(`deleting ${theme.name}…`, () => api(`/api/themes/${encodeURIComponent(theme.name)}`, { method: "DELETE" }));
          if (selectedTheme === theme.name) {
            selectedTheme = undefined;
            themeMode = "new";
            mountThemeDesigner();
            syncThemeControls();
          }
          await refreshThemes();
          status(`deleted ${theme.name}`);
        })().catch((error: Error) => status(error.message, "error"));
      });
      buttons.push(edit, base, remove);
    }
    row.append(name, ...buttons);
    list.append(row);
  }
}

async function refreshThemes(): Promise<void> {
  myThemes = (await api<{ themes: ThemeEntry[] }>("/api/themes")).themes;
  renderThemeList();
}

async function saveTheme(): Promise<void> {
  if (themeDesigner === undefined) return;
  const entry = themeDesigner.getTheme();
  await withBusy(`saving theme ${entry.name}…`, () => api(`/api/themes/${encodeURIComponent(entry.name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry)
  }));
  selectedTheme = entry.name;
  await refreshThemes();
  // A save ends the edit: back to viewing the stored entry read-only.
  const saved = myThemes.find((t) => t.name === entry.name);
  if (saved !== undefined) showTheme(saved, "viewing");
  status(`saved theme ${entry.name} — usable as theme: "${entry.name}" now`);
}

/** Open the theme designer in NEW mode with a seeded entry. */
function startThemeFrom(seed: unknown): void {
  selectedTheme = undefined;
  themeMode = "new";
  mountThemeDesigner(seed);
  renderThemeList();
  syncThemeControls();
}

/* ------------------------------ schemas ------------------------------ */

let schemaDesigner: SchemaDesignerHandle | undefined;
let selectedSchema: string | undefined;
let schemaMode: ListMode = "new";

function mountSchemaDesigner(loadEntry?: unknown, readOnly = false): void {
  const host = $("schema-designer");
  schemaDesigner?.dispose();
  host.replaceChildren();
  schemaDesigner = createSchemaDesigner(host, { readOnly });
  if (loadEntry !== undefined) {
    const result = schemaDesigner.loadSchema(loadEntry);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`, "error");
  }
}

function syncSchemaControls(): void {
  $("schema-new").hidden = schemaMode === "editing";
  $("schema-save").hidden = schemaMode !== "new";
}

function showSchema(schema: StoredSchemaJson, mode: "viewing" | "editing"): void {
  selectedSchema = schema.name;
  schemaMode = mode;
  mountSchemaDesigner(schema, mode === "viewing");
  renderSchemaList();
  syncSchemaControls();
}

function renderSchemaList(): void {
  const list = $("schema-list");
  list.replaceChildren();
  if (mySchemas.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Nothing yet — define a schema and save it.";
    list.append(empty);
    return;
  }
  for (const schema of mySchemas) {
    const row = document.createElement("div");
    row.className = "row" + (schema.name === selectedSchema ? " selected" : "");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = schema.label ?? schema.name;
    name.title = "View";
    name.addEventListener("click", () => showSchema(schema, "viewing"));
    const editing = schema.name === selectedSchema && schemaMode === "editing";
    const buttons: HTMLButtonElement[] = [];
    if (editing) {
      const save = document.createElement("button");
      save.textContent = "Save";
      save.className = "primary";
      save.addEventListener("click", () => {
        void saveSchema().catch((error: Error) => status(error.message, "error"));
      });
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => showSchema(schema, "viewing"));
      buttons.push(save, cancel);
    } else {
      const edit = document.createElement("button");
      edit.textContent = "\u270e";
      edit.className = "icon";
      edit.title = "Edit";
      edit.setAttribute("aria-label", "Edit");
      edit.addEventListener("click", () => showSchema(schema, "editing"));
      const remove = document.createElement("button");
      remove.textContent = "\u2715";
      remove.className = "danger icon";
      remove.title = "Delete";
      remove.setAttribute("aria-label", "Delete");
      remove.addEventListener("click", () => {
        void (async () => {
          // SCHEMA_IN_USE from the store surfaces here with the
          // referencing widgets named — never a silent failure.
          await withBusy(`deleting ${schema.name}…`, () => api(`/api/schemas/${encodeURIComponent(schema.name)}`, { method: "DELETE" }));
          if (selectedSchema === schema.name) {
            selectedSchema = undefined;
            schemaMode = "new";
            mountSchemaDesigner();
            syncSchemaControls();
          }
          await refreshSchemas();
          status(`deleted ${schema.name}`);
        })().catch((error: Error) => status(error.message, "error"));
      });
      buttons.push(edit, remove);
    }
    row.append(name, ...buttons);
    list.append(row);
  }
}

async function refreshSchemas(): Promise<void> {
  mySchemas = (await api<{ schemas: StoredSchemaJson[] }>("/api/schemas")).schemas;
  renderSchemaList();
}

async function saveSchema(): Promise<void> {
  if (schemaDesigner === undefined) return;
  const entry = schemaDesigner.getSchema();
  await withBusy(`saving schema ${entry.name}…`, () => api(`/api/schemas/${encodeURIComponent(entry.name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry)
  }));
  selectedSchema = entry.name;
  await refreshSchemas();
  const saved = mySchemas.find((s) => s.name === entry.name);
  if (saved !== undefined) showSchema(saved, "viewing");
  status(`saved schema ${entry.name} — widgets can reference it now`);
}

/* ------------------------------ actions ------------------------------ */

let actionDesigner: ActionDesignerHandle | undefined;
let selectedAction: string | undefined;
let actionMode: ListMode = "new";
/** JSON of the http definition whose test call last passed; save requires a match. */
let testedDefinition: string | undefined;

/** The designer's Test control runs the PRODUCTION execute path server-side. */
async function testCall(definition: HttpActionDefinition, args: Record<string, unknown>): Promise<unknown> {
  const result = await withBusy("running the test call…", () =>
    api<{ ok: boolean; code?: string; message?: string; status?: number; body?: unknown }>("/api/actions/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ definition, args })
    })
  );
  if (result.ok) {
    testedDefinition = JSON.stringify(definition);
    status("test call passed — the action can be saved");
  } else {
    testedDefinition = undefined;
    status(`test call failed: ${result.code ?? ""} ${result.message ?? ""}`.trim(), "error");
  }
  return result;
}

function mountActionDesigner(loadEntry?: unknown, readOnly = false): void {
  const host = $("action-designer");
  actionDesigner?.dispose();
  host.replaceChildren();
  testedDefinition = undefined;
  actionDesigner = createActionDesigner(host, {
    readOnly,
    schemas: mySchemas as SchemaEntry[],
    secretNames: mySecrets.map((s) => s.name),
    testCall
  });
  // Any change to an http definition invalidates the last passing test.
  actionDesigner.subscribe((entry) => {
    if (entry.definition.kind === "http" && testedDefinition !== JSON.stringify(entry.definition)) {
      testedDefinition = undefined;
    }
  });
  if (loadEntry !== undefined) {
    const result = actionDesigner.loadAction(loadEntry);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`, "error");
  }
}

function syncActionControls(): void {
  $("action-new").hidden = actionMode === "editing";
  $("action-save").hidden = actionMode !== "new";
}

function showAction(action: ActionEntry, mode: "viewing" | "editing"): void {
  selectedAction = action.name;
  actionMode = mode;
  mountActionDesigner(action, mode === "viewing");
  renderActionList();
  syncActionControls();
}

function renderActionList(): void {
  const list = $("action-list");
  list.replaceChildren();
  if (myActions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Nothing yet — define an action and save it.";
    list.append(empty);
    return;
  }
  for (const action of myActions) {
    const row = document.createElement("div");
    row.className = "row" + (action.name === selectedAction ? " selected" : "");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = `${action.label ?? action.name} · ${action.definition.kind}`;
    name.title = "View";
    name.addEventListener("click", () => showAction(action, "viewing"));
    const editing = action.name === selectedAction && actionMode === "editing";
    const buttons: HTMLButtonElement[] = [];
    if (editing) {
      const save = document.createElement("button");
      save.textContent = "Save";
      save.className = "primary";
      save.addEventListener("click", () => {
        void saveAction().catch((error: Error) => status(error.message, "error"));
      });
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => showAction(action, "viewing"));
      buttons.push(save, cancel);
    } else {
      const edit = document.createElement("button");
      edit.textContent = "\u270e";
      edit.className = "icon";
      edit.title = "Edit";
      edit.setAttribute("aria-label", "Edit");
      edit.addEventListener("click", () => showAction(action, "editing"));
      const remove = document.createElement("button");
      remove.textContent = "\u2715";
      remove.className = "danger icon";
      remove.title = "Delete";
      remove.setAttribute("aria-label", "Delete");
      remove.addEventListener("click", () => {
        void (async () => {
          // ACTION_IN_USE surfaces here naming the widgets — never silently.
          await withBusy(`deleting ${action.name}…`, () => api(`/api/actions/${encodeURIComponent(action.name)}`, { method: "DELETE" }));
          if (selectedAction === action.name) {
            selectedAction = undefined;
            actionMode = "new";
            mountActionDesigner();
            syncActionControls();
          }
          await refreshActions();
          status(`deleted ${action.name}`);
        })().catch((error: Error) => status(error.message, "error"));
      });
      buttons.push(edit, remove);
    }
    row.append(name, ...buttons);
    list.append(row);
  }
}

async function refreshActions(): Promise<void> {
  myActions = (await api<{ actions: ActionEntry[] }>("/api/actions")).actions;
  renderActionList();
}

const PROMPT_NOTICE =
  "Prompt actions place THIS message text into the user's composer for them to send. " +
  "The content is your responsibility: keep it plain, honest and free of instructions " +
  "that could mislead the user or their agent. Save the prompt action?";

async function saveAction(): Promise<void> {
  if (actionDesigner === undefined) return;
  const entry = actionDesigner.getAction();
  if (entry.definition.kind === "http") {
    // Save is gated on a passing test call for THIS definition.
    if (testedDefinition !== JSON.stringify(entry.definition)) {
      status("run a passing test call first — http actions save only after their test call succeeds", "error");
      return;
    }
  } else if (!window.confirm(PROMPT_NOTICE)) {
    status("save cancelled");
    return;
  }
  await withBusy(`saving action ${entry.name}…`, () =>
    api(`/api/actions/${encodeURIComponent(entry.name)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry)
    })
  );
  selectedAction = entry.name;
  await refreshActions();
  const saved = myActions.find((a) => a.name === entry.name);
  if (saved !== undefined) showAction(saved, "viewing");
  status(`saved action ${entry.name} — widgets can bind it now`);
}

/* ------------------------------ secrets ------------------------------ */

function renderSecretList(): void {
  const list = $("secret-list");
  list.replaceChildren();
  const disabled = !secretsEnabled;
  $<HTMLInputElement>("secret-name").disabled = disabled;
  $<HTMLInputElement>("secret-value").disabled = disabled;
  $<HTMLButtonElement>("secret-save").disabled = disabled;
  if (disabled) {
    $("secrets-note").textContent =
      "Secrets are unavailable: this deployment has no secret cipher configured (WIDGENTIC_KEK_ID or WIDGENTIC_LOCAL_KEK).";
    return;
  }
  if (mySecrets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No secrets yet.";
    list.append(empty);
    return;
  }
  for (const secret of mySecrets) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.className = "name";
    // Write-only: names and timestamps, never a value, preview or length.
    name.textContent = `${secret.name} · set ${new Date(secret.updatedAt).toLocaleString()}`;
    const replace = document.createElement("button");
    replace.textContent = "Replace";
    replace.addEventListener("click", () => {
      $<HTMLInputElement>("secret-name").value = secret.name;
      $<HTMLInputElement>("secret-value").focus();
    });
    const remove = document.createElement("button");
    remove.textContent = "\u2715";
    remove.className = "danger icon";
    remove.title = "Delete";
    remove.setAttribute("aria-label", "Delete");
    remove.addEventListener("click", () => {
      void (async () => {
        // SECRET_IN_USE surfaces here naming the referencing actions.
        await withBusy(`deleting ${secret.name}…`, () => api(`/api/secrets/${encodeURIComponent(secret.name)}`, { method: "DELETE" }));
        await refreshSecrets();
        status(`deleted secret ${secret.name}`);
      })().catch((error: Error) => status(error.message, "error"));
    });
    row.append(name, replace, remove);
    list.append(row);
  }
}

async function refreshSecrets(): Promise<void> {
  const listing = await api<{ enabled: boolean; secrets: SecretEntryJson[] }>("/api/secrets");
  secretsEnabled = listing.enabled;
  mySecrets = listing.secrets;
  renderSecretList();
}

async function saveSecret(): Promise<void> {
  const nameInput = $<HTMLInputElement>("secret-name");
  const valueInput = $<HTMLInputElement>("secret-value");
  const name = nameInput.value.trim();
  const value = valueInput.value;
  await withBusy(`storing secret ${name}…`, () =>
    api(`/api/secrets/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value })
    })
  );
  // The value leaves the page the moment it is stored.
  valueInput.value = "";
  nameInput.value = "";
  await refreshSecrets();
  status(`secret ${name} set — reference it as { "secret": "${name}" } in http actions`);
}

/* -------------------------------- keys ------------------------------- */

async function refreshKeys(): Promise<void> {
  const { keys } = await api<{ keys: StoredKeyJson[] }>("/api/keys");
  const rows = $("key-rows");
  rows.replaceChildren();
  for (const key of keys) {
    const tr = document.createElement("tr");
    const revoked = key.revokedAt !== undefined;
    const cells = [
      key.name,
      new Date(key.createdAt).toLocaleString(),
      `${key.digestPreview}…`,
      (key.scopes ?? ["read"]).join(", "),
      revoked ? "revoked" : "active"
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.append(td);
    }
    const actions = document.createElement("td");
    if (!revoked) {
      const revoke = document.createElement("button");
      revoke.textContent = "Revoke";
      revoke.className = "danger";
      revoke.addEventListener("click", () => {
        void (async () => {
          await withBusy(`revoking ${key.name}…`, () => api(`/api/keys/${encodeURIComponent(key.id)}`, { method: "DELETE" }));
          await refreshKeys();
          status(`revoked ${key.name}`);
        })().catch((error: Error) => status(error.message, "error"));
      });
      actions.append(revoke);
    }
    tr.append(actions);
    rows.append(tr);
  }
}

async function createKey(): Promise<void> {
  const input = $<HTMLInputElement>("key-name");
  const name = input.value.trim();
  const execute = $<HTMLInputElement>("key-execute").checked;
  // Scopes are fixed at creation: read always, execute only when ticked.
  const created = await withBusy("creating key…", () =>
    api<{ key: string; notice: string }>("/api/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, scopes: execute ? ["read", "execute"] : ["read"] })
    })
  );
  input.value = "";
  $<HTMLInputElement>("key-execute").checked = false;
  const reveal = $("key-reveal");
  reveal.replaceChildren();
  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = created.notice;
  const code = document.createElement("code");
  code.className = "reveal";
  code.textContent = created.key;
  const dismiss = document.createElement("button");
  dismiss.textContent = "I stored it";
  dismiss.addEventListener("click", () => reveal.replaceChildren());
  reveal.append(note, code, dismiss);
  await refreshKeys();
}

/* -------------------------------- tabs ------------------------------- */

const SECTIONS = ["widgets", "themes", "schemas", "actions", "secrets", "keys"] as const;

function showTab(name: (typeof SECTIONS)[number]): void {
  for (const section of SECTIONS) {
    $(`${section}-section`).hidden = section !== name;
    $(`tab-${section}`).classList.toggle("active", section === name);
  }
  // Returning to widgets re-mounts the designer so newly saved themes
  // appear in its preview selector — preserving the current mode.
  if (name === "widgets") {
    mountWidgetDesigner(currentDefinition(), widgetMode === "viewing");
  }
  // Symmetrically: returning to themes re-mounts so newly saved WIDGETS
  // appear in its preview-kind selector, preserving entry and mode.
  if (name === "themes") {
    mountThemeDesigner(themeDesigner?.getTheme(), themeMode === "viewing");
  }
  // Actions re-mount so newly saved schemas and secrets are offered.
  if (name === "actions") {
    mountActionDesigner(actionDesigner?.getAction(), actionMode === "viewing");
  }
}

function currentDefinition(): unknown {
  if (widgetDesigner === undefined) return undefined;
  const draft = widgetDesigner.getDraft();
  return {
    kind: draft.kind,
    template: draft.template,
    descriptor: draft.descriptor,
    ...(draft.load !== undefined ? { load: draft.load } : {})
  };
}

/* -------------------------------- boot ------------------------------- */

/* ---------------------------- identities ----------------------------- */

/** github:<id> vs everything else (OIDC subs carry no prefix). */
function providerOf(subject: unknown): "github" | "email" {
  return typeof subject === "string" && subject.startsWith("github:")
    ? "github"
    : "email";
}

async function refreshIdentities(): Promise<void> {
  const info = await api<{
    current: string;
    currentIsPrimary: boolean;
    primary: { subject: string; label?: string };
    linked: { subject: string; label?: string }[];
  }>("/api/identities");
  const list = $("identity-list");
  list.replaceChildren();

  const display = (subject: string, label?: string) =>
    label ?? (subject.startsWith("github:") ? subject : subject.slice(0, 12) + "…");

  const row = (
    subject: string,
    label: string | undefined,
    tags: string[],
    unlinkable: boolean
  ) => {
    const el = document.createElement("div");
    el.className = "row";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = `${providerOf(subject) === "github" ? "GitHub" : "Email"} — ${display(subject, label)}`;
    name.title = subject; // the raw subject stays one hover away
    const badge = document.createElement("span");
    badge.className = "muted";
    badge.textContent = tags.join(" · ");
    el.append(name, badge);
    if (unlinkable) {
      const unlink = document.createElement("button");
      unlink.textContent = "Unlink";
      unlink.className = "danger";
      unlink.addEventListener("click", () => {
        void (async () => {
          await api("/api/identities", {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ subject })
          });
          status(
            `unlinked ${display(subject, label)} — signing in with it later starts a fresh account`
          );
          await refreshIdentities();
        })().catch((error: Error) => status(error.message, "error"));
      });
      el.append(unlink);
    }
    list.append(el);
  };

  // The full set renders from EITHER side: primary first, then links.
  row(
    info.primary.subject,
    info.primary.label,
    ["primary", ...(info.currentIsPrimary ? ["signed in"] : [])],
    false
  );
  for (const identity of info.linked) {
    row(
      identity.subject,
      identity.label,
      identity.subject === info.current ? ["linked", "signed in"] : ["linked"],
      // Manage links from the primary session; unlinking yourself is a footgun.
      info.currentIsPrimary
    );
  }
  if (!info.currentIsPrimary) {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent =
      "You are signed in with a linked identity. Manage links from the primary identity's session.";
    list.append(note);
  }

  // Offer linking whichever provider is not attached anywhere on the account.
  const attached = new Set(
    [info.primary.subject, info.current, ...info.linked.map((l) => l.subject)].map(providerOf)
  );
  const actions = $("identity-actions");
  actions.replaceChildren();
  for (const provider of ["github", "email"] as const) {
    if (attached.has(provider)) continue;
    const link = document.createElement("a");
    link.href = provider === "github" ? "/auth/link/github" : "/auth/link/email";
    const button = document.createElement("button");
    button.textContent = provider === "github" ? "Link GitHub" : "Link email";
    link.append(button);
    actions.append(link);
  }
  const note = document.createElement("span");
  note.className = "muted";
  note.textContent =
    "Linked identities share this account: same widgets, themes, schemas, and keys.";
  actions.append(note);
}

async function boot(): Promise<void> {
  try {
    const me = await api<{ principal: { id: string; label?: string } }>("/api/me");
    $("signin-view").hidden = true;
    $("app-view").hidden = false;
    $("signout").hidden = false;
    $("account").textContent = me.principal.label ?? me.principal.id;
  } catch {
    $("signin-view").hidden = false;
    $("app-view").hidden = true;
    return;
  }

  // One section failing must not blank the app: settle all, report failures.
  const sections = await Promise.allSettled([
    refreshWidgets(),
    refreshThemes(),
    refreshSchemas(),
    refreshActions(),
    refreshSecrets(),
    refreshKeys(),
    refreshIdentities()
  ]);
  for (const settled of sections) {
    if (settled.status === "rejected") {
      status(`a section failed to load: ${String(settled.reason)}`, "error");
    }
  }

  // Link-flow feedback rides the redirect query.
  const params = new URLSearchParams(location.search);
  if (params.has("linked")) {
    status("identity linked — both sign-in methods now open this account");
    showTab("keys");
    history.replaceState(null, "", "/");
  } else if (params.has("link_error")) {
    const code = params.get("link_error");
    status(
      code === "SUBJECT_IN_USE"
        ? "link refused: that identity already owns an account with content — empty it first"
        : `link failed: ${code}`
    );
    showTab("keys");
    history.replaceState(null, "", "/");
  }
  mountWidgetDesigner();
  mountThemeDesigner();
  mountSchemaDesigner();
  mountActionDesigner();

  $("status-dismiss").addEventListener("click", () => status(""));
  $("tab-widgets").addEventListener("click", () => showTab("widgets"));
  $("tab-themes").addEventListener("click", () => showTab("themes"));
  $("tab-schemas").addEventListener("click", () => showTab("schemas"));
  $("tab-actions").addEventListener("click", () => showTab("actions"));
  $("tab-secrets").addEventListener("click", () => showTab("secrets"));
  $("tab-keys").addEventListener("click", () => showTab("keys"));

  $("widget-new").addEventListener("click", () => {
    selectedKind = undefined;
    widgetMode = "new";
    mountWidgetDesigner();
    renderWidgetList();
    syncWidgetControls();
  });
  $("widget-save").addEventListener("click", () => {
    void saveWidget().catch((error: Error) => status(error.message, "error"));
  });
  $("widget-seed").addEventListener("change", () => {
    const select = $("widget-seed") as HTMLSelectElement;
    const from = select.value;
    select.value = "";
    if (from !== "card" && from !== "table" && from !== "tree") return;
    startWidgetFrom(seedWidgetDraft(from, myWidgets.map((w) => w.kind)));
  });
  $("theme-new").addEventListener("click", () => {
    selectedTheme = undefined;
    themeMode = "new";
    mountThemeDesigner();
    renderThemeList();
    syncThemeControls();
  });
  $("theme-save").addEventListener("click", () => {
    void saveTheme().catch((error: Error) => status(error.message, "error"));
  });
  $("theme-seed").addEventListener("change", () => {
    const select = $("theme-seed") as HTMLSelectElement;
    const from = select.value;
    select.value = "";
    if (from !== "light" && from !== "dark") return;
    startThemeFrom(seedThemeEntry(from, myThemes.map((t) => t.name)));
  });
  $("schema-new").addEventListener("click", () => {
    selectedSchema = undefined;
    schemaMode = "new";
    mountSchemaDesigner();
    renderSchemaList();
    syncSchemaControls();
  });
  $("schema-save").addEventListener("click", () => {
    void saveSchema().catch((error: Error) => status(error.message, "error"));
  });
  $("key-create").addEventListener("click", () => {
    void createKey().catch((error: Error) => status(error.message, "error"));
  });
  $("action-new").addEventListener("click", () => {
    selectedAction = undefined;
    actionMode = "new";
    mountActionDesigner();
    renderActionList();
    syncActionControls();
  });
  $("action-save").addEventListener("click", () => {
    void saveAction().catch((error: Error) => status(error.message, "error"));
  });
  $("secret-save").addEventListener("click", () => {
    void saveSecret().catch((error: Error) => status(error.message, "error"));
  });
}

void boot();
