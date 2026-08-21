/**
 * The widgentic.dev client: sign-in state, the two designers mounted
 * against the authoring API, and key management. Design-it-is-publish:
 * "Save to my catalog" PUTs through the session, and the entry is in the
 * caller's MCP catalog on the next tool call — no other step exists.
 */
import { createDesigner, createSchemaDesigner, createThemeDesigner, seedThemeEntry, seedWidgetDraft } from "widgentic/designer";
import type { WidgetDraft } from "widgentic/designer";
import type {
  DesignerHandle,
  SchemaDesignerHandle,
  SchemaEntry,
  ThemeDesignerHandle
} from "widgentic/designer";
import { createThemeRegistry } from "widgentic/theming";
import type { ThemeEntry } from "widgentic/theming";

interface StoredWidgetJson {
  kind: string;
  template: unknown;
  descriptor: unknown;
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
  digestPreview: string;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const status = (text: string): void => {
  $("status").textContent = text;
};

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
  widgetDesigner = createDesigner(host, {
    themes: designerThemes(),
    schemas: mySchemas as SchemaEntry[],
    readOnly
  });
  if (loadDefinition !== undefined) {
    const result = widgetDesigner.loadWidget(loadDefinition);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`);
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
        void saveWidget().catch((error: Error) => status(error.message));
      });
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => showWidget(widget, "viewing"));
      buttons.push(save, cancel);
    } else {
      const edit = document.createElement("button");
      edit.textContent = "Edit";
      edit.addEventListener("click", () => showWidget(widget, "editing"));
      const base = document.createElement("button");
      base.textContent = "Copy";
      base.title = "Start a new widget as a copy of this one";
      base.addEventListener("click", () => {
        // StoredWidgetJson is the store's validated shape; loadWidget
        // re-validates the seed on mount either way.
        startWidgetFrom(
          seedWidgetDraft(widget as unknown as WidgetDraft, myWidgets.map((w) => w.kind))
        );
      });
      const remove = document.createElement("button");
      remove.textContent = "Delete";
      remove.className = "danger";
      remove.addEventListener("click", () => {
        void (async () => {
          await api(`/api/widgets/${encodeURIComponent(widget.kind)}`, { method: "DELETE" });
          if (selectedKind === widget.kind) {
            selectedKind = undefined;
            widgetMode = "new";
            mountWidgetDesigner();
            syncWidgetControls();
          }
          await refreshWidgets();
          status(`deleted ${widget.kind}`);
        })().catch((error: Error) => status(error.message));
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
  await api(`/api/widgets/${encodeURIComponent(draft.kind)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ template: draft.template, descriptor: draft.descriptor })
  });
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
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`);
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
        void saveTheme().catch((error: Error) => status(error.message));
      });
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => showTheme(theme, "viewing"));
      buttons.push(save, cancel);
    } else {
      const edit = document.createElement("button");
      edit.textContent = "Edit";
      edit.addEventListener("click", () => showTheme(theme, "editing"));
      const base = document.createElement("button");
      base.textContent = "Copy";
      base.title = "Start a new theme as a copy of this one";
      base.addEventListener("click", () => {
        startThemeFrom(seedThemeEntry(theme, myThemes.map((t) => t.name)));
      });
      const remove = document.createElement("button");
      remove.textContent = "Delete";
      remove.className = "danger";
      remove.addEventListener("click", () => {
        void (async () => {
          await api(`/api/themes/${encodeURIComponent(theme.name)}`, { method: "DELETE" });
          if (selectedTheme === theme.name) {
            selectedTheme = undefined;
            themeMode = "new";
            mountThemeDesigner();
            syncThemeControls();
          }
          await refreshThemes();
          status(`deleted ${theme.name}`);
        })().catch((error: Error) => status(error.message));
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
  await api(`/api/themes/${encodeURIComponent(entry.name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry)
  });
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
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`);
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
        void saveSchema().catch((error: Error) => status(error.message));
      });
      const cancel = document.createElement("button");
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => showSchema(schema, "viewing"));
      buttons.push(save, cancel);
    } else {
      const edit = document.createElement("button");
      edit.textContent = "Edit";
      edit.addEventListener("click", () => showSchema(schema, "editing"));
      const remove = document.createElement("button");
      remove.textContent = "Delete";
      remove.className = "danger";
      remove.addEventListener("click", () => {
        void (async () => {
          // SCHEMA_IN_USE from the store surfaces here with the
          // referencing widgets named — never a silent failure.
          await api(`/api/schemas/${encodeURIComponent(schema.name)}`, { method: "DELETE" });
          if (selectedSchema === schema.name) {
            selectedSchema = undefined;
            schemaMode = "new";
            mountSchemaDesigner();
            syncSchemaControls();
          }
          await refreshSchemas();
          status(`deleted ${schema.name}`);
        })().catch((error: Error) => status(error.message));
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
  await api(`/api/schemas/${encodeURIComponent(entry.name)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(entry)
  });
  selectedSchema = entry.name;
  await refreshSchemas();
  const saved = mySchemas.find((s) => s.name === entry.name);
  if (saved !== undefined) showSchema(saved, "viewing");
  status(`saved schema ${entry.name} — widgets can reference it now`);
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
          await api(`/api/keys/${encodeURIComponent(key.id)}`, { method: "DELETE" });
          await refreshKeys();
          status(`revoked ${key.name}`);
        })().catch((error: Error) => status(error.message));
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
  const created = await api<{ key: string; notice: string }>("/api/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name })
  });
  input.value = "";
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

const SECTIONS = ["widgets", "themes", "schemas", "keys"] as const;

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
}

function currentDefinition(): unknown {
  if (widgetDesigner === undefined) return undefined;
  const draft = widgetDesigner.getDraft();
  return { kind: draft.kind, template: draft.template, descriptor: draft.descriptor };
}

/* -------------------------------- boot ------------------------------- */

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

  await Promise.all([refreshWidgets(), refreshThemes(), refreshSchemas(), refreshKeys()]);
  mountWidgetDesigner();
  mountThemeDesigner();
  mountSchemaDesigner();

  $("tab-widgets").addEventListener("click", () => showTab("widgets"));
  $("tab-themes").addEventListener("click", () => showTab("themes"));
  $("tab-schemas").addEventListener("click", () => showTab("schemas"));
  $("tab-keys").addEventListener("click", () => showTab("keys"));

  $("widget-new").addEventListener("click", () => {
    selectedKind = undefined;
    widgetMode = "new";
    mountWidgetDesigner();
    renderWidgetList();
    syncWidgetControls();
  });
  $("widget-save").addEventListener("click", () => {
    void saveWidget().catch((error: Error) => status(error.message));
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
    void saveTheme().catch((error: Error) => status(error.message));
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
    void saveSchema().catch((error: Error) => status(error.message));
  });
  $("key-create").addEventListener("click", () => {
    void createKey().catch((error: Error) => status(error.message));
  });
}

void boot();
