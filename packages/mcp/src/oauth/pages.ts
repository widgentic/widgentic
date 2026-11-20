/**
 * The three pages the surface serves: sign-in choice, consent, error. No
 * script, no external resource, never framed, never cached. Every value is
 * escaped; the client's name and redirect host are text the client chose,
 * and the pages say so.
 */
import { createHash } from "node:crypto";
import type { AuthorizationPage, AuthorizationResponse } from "./types.js";

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--ink:#16181d;--mute:#5b6270;--line:#d9dde4;--accent:#2f5fd0;--accent-ink:#fff;--warn:#8a4b00;--warn-bg:#fff4e0}
@media (prefers-color-scheme:dark){:root{--bg:#111318;--card:#1a1d24;--ink:#eceef2;--mute:#a2a9b6;--line:#333844;--accent:#7ea2ff;--accent-ink:#0d1220;--warn:#ffd08a;--warn-bg:#3a2a10}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:30rem;margin:3rem auto;padding:0 1rem}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1.5rem}
h1{font-size:1.25rem;margin:0 0 .75rem}
p{margin:.5rem 0}
.who{color:var(--mute);font-size:.9rem}
.app{border:1px solid var(--line);border-radius:8px;padding:.75rem;margin:1rem 0}
.app strong{display:block;overflow-wrap:anywhere}
.note{color:var(--mute);font-size:.85rem}
.problem{background:var(--warn-bg);color:var(--warn);border-radius:8px;padding:.6rem .75rem}
fieldset{border:0;padding:0;margin:1rem 0}
legend{font-weight:600;padding:0;margin-bottom:.5rem}
label.key{display:flex;gap:.6rem;align-items:flex-start;border:1px solid var(--line);border-radius:8px;padding:.6rem .75rem;margin:.4rem 0}
label.key span{display:block}
label.key small{color:var(--mute)}
.new{margin:.25rem 0 0 1.9rem}
input[type=text]{width:100%;padding:.45rem .6rem;border:1px solid var(--line);border-radius:6px;background:transparent;color:inherit;font:inherit}
.actions{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1.25rem}
button,a.button{font:inherit;padding:.55rem 1rem;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;cursor:pointer;text-decoration:none;display:inline-block}
button.primary,a.button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
ul.signin{list-style:none;padding:0;margin:1rem 0;display:grid;gap:.5rem}
hr{border:0;border-top:1px solid var(--line);margin:1.25rem 0}
`.trim();

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function document(title: string, body: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main><section>${body}</section></main></body></html>`
  );
}

function application(clientName: string, redirectHost: string): string {
  return (
    `<div class="app"><strong>${escapeHtml(clientName)}</strong>` +
    `<span class="note">returns to ${escapeHtml(redirectHost)} · name and address are reported by the application and not verified</span></div>`
  );
}

function hidden(name: string, value: string): string {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;
}

/** The built-in markup for a page. */
export function defaultPage(page: AuthorizationPage): string {
  if (page.kind === "error") {
    const back =
      page.back === undefined
        ? ""
        : `<div class="actions"><a class="button" href="${escapeHtml(page.back.href)}" rel="noreferrer">Return to ${escapeHtml(page.back.host)}</a></div>` +
          `<p class="note">That address was supplied by the application and is not verified.</p>`;
    return document(page.title, `<h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.message)}</p>${back}`);
  }
  if (page.kind === "sign-in") {
    const links = page.signIn
      .map((link) => `<li><a class="button primary" href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`)
      .join("");
    return document(
      "Connect an application",
      `<h1>Connect an application to your widgets</h1>${application(page.clientName, page.redirectHost)}` +
        (links === "" ? "" : `<p>Sign in to choose the API key it will use.</p><ul class="signin">${links}</ul><hr>`) +
        `<form method="post" action="${escapeHtml(page.decisionPath)}">${hidden("request", page.decisionToken)}` +
        `<p class="note">Without an account the application gets the built-in widgets only.</p>` +
        `<div class="actions"><button type="submit" name="action" value="anonymous">Continue without an account</button>` +
        `<button type="submit" name="action" value="deny">Cancel</button></div></form>`
    );
  }
  const keys = page.keys
    .map(
      (key, index) =>
        `<label class="key"><input type="radio" name="key" value="${escapeHtml(key.id)}"${index === 0 ? " checked" : ""}>` +
        `<span>${escapeHtml(key.name)}<small> · ${escapeHtml(key.scopes.join(", "))} · ${escapeHtml(key.digestPreview)}…</small></span></label>`
    )
    .join("");
  const asked =
    page.requestedScopes === undefined
      ? ""
      : `<p class="note">It asked for: ${escapeHtml(page.requestedScopes.join(", "))}. It never gets more than the key allows.</p>`;
  return document(
    "Connect an application",
    `<h1>Connect an application to your widgets</h1><p class="who">Signed in as ${escapeHtml(page.principalLabel)}</p>` +
      application(page.clientName, page.redirectHost) +
      (page.problem === undefined ? "" : `<p class="problem">${escapeHtml(page.problem)}</p>`) +
      `<form method="post" action="${escapeHtml(page.decisionPath)}">${hidden("request", page.decisionToken)}` +
      `<fieldset><legend>API key it will use</legend>${keys}` +
      `<label class="key"><input type="radio" name="key" value="new"${page.keys.length === 0 ? " checked" : ""}><span>Create a new key</span></label>` +
      `<div class="new"><input type="text" name="name" maxlength="80" value="${escapeHtml(page.clientName)}" aria-label="Name of the new key">` +
      `<p><label><input type="checkbox" name="execute" value="on"> Let it run actions (execute)</label></p></div></fieldset>` +
      asked +
      `<p class="note">The application gets this key's permissions. Revoking the key disconnects it.</p>` +
      `<div class="actions"><button class="primary" type="submit" name="action" value="approve">Connect</button>` +
      `<button type="submit" name="action" value="deny">Cancel</button></div></form>`
  );
}

const INLINE_STYLE = /<style[^>]*>([\s\S]*?)<\/style>/gi;

/** A page as a response: its markup under a policy that admits only its own inline styles. */
export function pageResponse(status: number, html: string): AuthorizationResponse {
  const hashes = [...html.matchAll(INLINE_STYLE)].map(
    (match) => `'sha256-${createHash("sha256").update(match[1] ?? "", "utf8").digest("base64")}'`
  );
  return {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // No form-action directive: browsers apply it to the redirect a form
      // post answers with, which is exactly how the flow returns to the host.
      "Content-Security-Policy": `default-src 'none'; style-src ${hashes.length > 0 ? hashes.join(" ") : "'none'"}; base-uri 'none'; frame-ancestors 'none'`,
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store"
    },
    body: html
  };
}
