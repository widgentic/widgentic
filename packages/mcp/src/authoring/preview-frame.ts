/**
 * The designers' preview island: the MCP Apps app template, served with the
 * frame policy MCP Apps hosts apply for the same resource domains. The
 * designer frames it in an opaque-origin sandbox and acts as its host, so a
 * preview runs the renderer hosts run, under the policy hosts apply.
 *
 * The policy grants what `_meta.ui.csp.resourceDomains` grants (images,
 * styles, fonts, media) for the operator's domains and then the
 * principal's, and allows only the template's own inline scripts, by hash.
 * With no principal it grants the operator's domains alone: a preview never
 * breaks.
 */
import { parseResourceDomains } from "@widgentic/core";
import { buildAppTemplate } from "../server/app-template.js";
import { composeResourceDomains } from "../store/compose.js";
import type { AuthoringDeps, AuthoringResponse, PrincipalContext } from "./types.js";

const INLINE_SCRIPT = /<script\b[^>]*>([\s\S]*?)<\/script>/g;

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** `'sha256-…'` sources for each inline script in `html`, in document order. */
export async function inlineScriptHashes(html: string): Promise<string[]> {
  const bodies = [...html.matchAll(INLINE_SCRIPT)].map((match) => match[1] ?? "");
  return Promise.all(
    bodies.map(async (body) => {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
      return `'sha256-${base64(new Uint8Array(digest))}'`;
    })
  );
}

/** The frame policy for `domains` (canonical origins) and the template's script hashes. */
export function previewFrameCsp(domains: readonly string[], scriptHashes: readonly string[]): string {
  const extra = domains.length === 0 ? "" : ` ${domains.join(" ")}`;
  return [
    "default-src 'none'",
    `script-src ${scriptHashes.join(" ")}`,
    `style-src 'unsafe-inline'${extra}`,
    `img-src data:${extra}`,
    `font-src${extra.length === 0 ? " 'none'" : extra}`,
    `media-src${extra.length === 0 ? " 'none'" : extra}`,
    "connect-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'"
  ].join("; ");
}

/** The template is the same bytes for every request; its hashes are computed once. */
let frame: { html: string; hashes: Promise<string[]> } | undefined;
function frameDocument(): { html: string; hashes: Promise<string[]> } {
  if (frame === undefined) {
    const html = buildAppTemplate();
    frame = { html, hashes: inlineScriptHashes(html) };
  }
  return frame;
}

/** `GET /preview-frame`: the template and its policy for this request's principal. */
export async function handlePreviewFrame(
  deps: AuthoringDeps,
  context: PrincipalContext | undefined
): Promise<AuthoringResponse> {
  const operator = parseResourceDomains(deps.resourceDomains ?? []).domains.map((domain) => domain.origin);
  let principal: string[] = [];
  if (context !== undefined) {
    const composed = await composeResourceDomains(deps.store, context.principalId);
    principal = composed.value;
    const log = deps.log ?? ((line: string) => console.error(line));
    for (const diagnostic of composed.diagnostics) log(`widgentic authoring: preview frame: ${diagnostic}`);
  }
  const domains = [...new Set([...operator, ...principal])];
  const { html, hashes } = frameDocument();
  return {
    status: 200,
    body: undefined,
    html,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": previewFrameCsp(domains, await hashes),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  };
}
