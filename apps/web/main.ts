/**
 * The widgentic.dev client: sign-in state, the two designers mounted
 * against the authoring API, and key management. Design-it-is-publish:
 * "Save to my catalog" PUTs through the session, and the entry is in the
 * caller's MCP catalog on the next tool call — no other step exists.
 */
import { createDesigner, createThemeDesigner } from "widgentic/designer";
import type { DesignerHandle, ThemeDesignerHandle } from "widgentic/designer";
import { createThemeRegistry } from "widgentic/theming";
import type { ThemeEntry } from "widgentic/theming";

interface StoredWidgetJson {
  kind: string;
  template: unknown;
  descriptor: unknown;
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

let widgetDesigner: DesignerHandle | undefined;
let myThemes: ThemeEntry[] = [];
let myWidgets: StoredWidgetJson[] = [];
let selectedKind: string | undefined;

function designerThemes(): ThemeEntry[] {
  const builtIns = createThemeRegistry().list();
  const names = new Set(builtIns.map((t) => t.name));
  return [...builtIns, ...myThemes.filter((t) => !names.has(t.name))];
}

function mountWidgetDesigner(loadDefinition?: unknown): void {
  const host = $("widget-designer");
  widgetDesigner?.dispose();
  host.replaceChildren();
  widgetDesigner = createDesigner(host, { themes: designerThemes() });
  if (loadDefinition !== undefined) {
    const result = widgetDesigner.loadWidget(loadDefinition);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`);
  }
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
    const open = document.createElement("button");
    open.textContent = "Edit";
    open.addEventListener("click", () => {
      selectedKind = widget.kind;
      mountWidgetDesigner(widget);
      renderWidgetList();
    });
    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.className = "danger";
    remove.addEventListener("click", () => {
      void (async () => {
        await api(`/api/widgets/${encodeURIComponent(widget.kind)}`, { method: "DELETE" });
        await refreshWidgets();
        status(`deleted ${widget.kind}`);
      })().catch((error: Error) => status(error.message));
    });
    row.append(name, open, remove);
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
  status(`saved ${draft.kind} — it is in your MCP catalog now`);
}

/* ------------------------------- themes ------------------------------ */

let themeDesigner: ThemeDesignerHandle | undefined;
let selectedTheme: string | undefined;

function mountThemeDesigner(loadEntry?: unknown): void {
  const host = $("theme-designer");
  themeDesigner?.dispose();
  host.replaceChildren();
  themeDesigner = createThemeDesigner(host);
  if (loadEntry !== undefined) {
    const result = themeDesigner.loadTheme(loadEntry);
    if (!result.ok) status(`load failed: ${result.errors.join("; ")}`);
  }
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
    const open = document.createElement("button");
    open.textContent = "Edit";
    open.addEventListener("click", () => {
      selectedTheme = theme.name;
      mountThemeDesigner(theme);
      renderThemeList();
    });
    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.className = "danger";
    remove.addEventListener("click", () => {
      void (async () => {
        await api(`/api/themes/${encodeURIComponent(theme.name)}`, { method: "DELETE" });
        await refreshThemes();
        status(`deleted ${theme.name}`);
      })().catch((error: Error) => status(error.message));
    });
    row.append(name, open, remove);
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
  status(`saved theme ${entry.name} — usable as theme: "${entry.name}" now`);
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

const SECTIONS = ["widgets", "themes", "keys"] as const;

function showTab(name: (typeof SECTIONS)[number]): void {
  for (const section of SECTIONS) {
    $(`${section}-section`).hidden = section !== name;
    $(`tab-${section}`).classList.toggle("active", section === name);
  }
  // Returning to widgets re-mounts the designer so newly saved themes
  // appear in its preview selector.
  if (name === "widgets") mountWidgetDesigner(currentDefinition());
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

  await Promise.all([refreshWidgets(), refreshThemes(), refreshKeys()]);
  mountWidgetDesigner();
  mountThemeDesigner();

  $("tab-widgets").addEventListener("click", () => showTab("widgets"));
  $("tab-themes").addEventListener("click", () => showTab("themes"));
  $("tab-keys").addEventListener("click", () => showTab("keys"));

  $("widget-new").addEventListener("click", () => {
    selectedKind = undefined;
    mountWidgetDesigner();
    renderWidgetList();
  });
  $("widget-save").addEventListener("click", () => {
    void saveWidget().catch((error: Error) => status(error.message));
  });
  $("theme-new").addEventListener("click", () => {
    selectedTheme = undefined;
    mountThemeDesigner();
    renderThemeList();
  });
  $("theme-save").addEventListener("click", () => {
    void saveTheme().catch((error: Error) => status(error.message));
  });
  $("key-create").addEventListener("click", () => {
    void createKey().catch((error: Error) => status(error.message));
  });
}

void boot();
