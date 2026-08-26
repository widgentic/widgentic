/**
 * The outbound-request discipline every server-side fetch shares: https
 * only, the target resolved and checked against private/reserved ranges,
 * the connection PINNED to the validated address (so a DNS answer that
 * changes between check and connect has nothing to bind to), bounded time
 * and bytes. The image inliner and http actions both build on this.
 */
import type { BuiltRequest } from "../actions/index.js";

/**
 * Request init for the pinned transport: `address`/`family` name the exact
 * validated socket target. The default transport MUST connect there; test
 * fakes (which are plain fetch-shaped) may ignore them.
 */
export interface PinnedRequestInit extends RequestInit {
  address: string;
  family: 4 | 6;
  /** Per-request socket timeout for the default transport. */
  timeoutMs?: number;
}

export type PinnedFetch = (url: string, init: PinnedRequestInit) => Promise<Response>;
export type Lookup = (hostname: string) => Promise<string[]>;

/** True for loopback, private, link-local, CGNAT, and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1] !== undefined) return isPrivateAddress(mapped[1]);

  if (address.includes(":")) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    // fc00::/7 (unique local) and fe80::/10 (link local).
    return /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return true; // unparsable — treat as unsafe
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    (a === 169 && b === 254) || // link-local incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast + reserved + broadcast
  );
}

function isIpLiteral(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":");
}

export async function defaultLookup(hostname: string): Promise<string[]> {
  const { lookup } = await import("node:dns/promises");
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

/**
 * Reject URLs whose host is (or resolves to) a non-public address; on
 * success return the exact address the connection must be PINNED to.
 */
export async function resolvePublicAddress(
  url: URL,
  lookupImpl: Lookup
): Promise<{ address: string; family: 4 | 6 } | undefined> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIpLiteral(host)) {
    return isPrivateAddress(host)
      ? undefined
      : { address: host, family: host.includes(":") ? 6 : 4 };
  }
  try {
    const addresses = await lookupImpl(host);
    if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a))) {
      return undefined;
    }
    const first = addresses[0] as string;
    return { address: first, family: first.includes(":") ? 6 : 4 };
  } catch {
    return undefined;
  }
}

/**
 * Default transport: HTTPS via node:https with the socket target fixed to
 * the validated address — the custom `lookup` never consults DNS. TLS
 * servername and the Host header stay the URL hostname, keeping
 * certificate validation intact. Redirects are NOT followed here.
 */
export async function pinnedHttpsFetch(url: string, init: PinnedRequestInit): Promise<Response> {
  const { request } = await import("node:https");
  const { Readable } = await import("node:stream");
  const headers: Record<string, string> = {};
  if (init.headers !== undefined) {
    for (const [name, value] of Object.entries(init.headers as Record<string, string>)) {
      headers[name] = value;
    }
  }
  const body = typeof init.body === "string" ? init.body : undefined;
  if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body, "utf8"));
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      url,
      {
        method: init.method ?? "GET",
        headers,
        family: init.family,
        lookup: (_hostname, _options, callback) => {
          (callback as (err: null, address: string, family: number) => void)(
            null,
            init.address,
            init.family
          );
        },
        timeout: init.timeoutMs ?? 4000
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const responseHeaders = new Headers();
        for (const name of ["content-type", "content-length", "location"]) {
          const value = res.headers[name];
          if (typeof value === "string") responseHeaders.set(name, value);
        }
        const bodyless = status < 200 || [204, 205, 304].includes(status);
        const responseBody = bodyless
          ? (res.resume(), null)
          : (Readable.toWeb(res) as unknown as BodyInit);
        resolve(new Response(responseBody, { status, headers: responseHeaders }));
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** Injectable transport and resolver, so tests run without network or DNS. */
export interface GuardedFetchDeps {
  fetchImpl?: PinnedFetch;
  lookupImpl?: Lookup;
}

export const ACTION_TIMEOUT_MS = 8_000;
export const ACTION_MAX_BYTES = 256 * 1024;

export type GuardedJsonResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; reason: string };

/**
 * Perform an http action's request under the action fetch policy: https
 * only, public pinned target, NO redirects, 8 s, 256 KiB, JSON body
 * required. Never throws; failures carry a reason the caller redacts.
 */
export async function guardedJsonFetch(
  built: BuiltRequest,
  deps: GuardedFetchDeps = {}
): Promise<GuardedJsonResult> {
  const fetchImpl = deps.fetchImpl ?? pinnedHttpsFetch;
  const lookupImpl = deps.lookupImpl ?? defaultLookup;
  let parsed: URL;
  try {
    parsed = new URL(built.url);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "only https targets are allowed" };
  const pinned = await resolvePublicAddress(parsed, lookupImpl);
  if (pinned === undefined) {
    return { ok: false, reason: `target '${parsed.hostname}' is not a public address` };
  }
  let response: Response;
  try {
    response = await fetchImpl(parsed.href, {
      method: built.method,
      headers: { accept: "application/json", ...built.headers },
      ...(built.body !== undefined ? { body: built.body } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(ACTION_TIMEOUT_MS),
      timeoutMs: ACTION_TIMEOUT_MS,
      address: pinned.address,
      family: pinned.family
    });
  } catch (error) {
    return { ok: false, reason: `request failed: ${(error as Error).message}` };
  }
  const drain = () => response.body?.cancel().catch(() => undefined);
  if (response.status >= 300 && response.status < 400) {
    await drain();
    return { ok: false, reason: `target answered a redirect (${response.status}); redirects are not followed` };
  }
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > ACTION_MAX_BYTES) {
    await drain();
    return { ok: false, reason: `response exceeds ${ACTION_MAX_BYTES} bytes` };
  }
  let text = "";
  if (response.body !== null) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > ACTION_MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          return { ok: false, reason: `response exceeds ${ACTION_MAX_BYTES} bytes` };
        }
        chunks.push(value);
      }
    } catch (error) {
      return { ok: false, reason: `reading the response failed: ${(error as Error).message}` };
    }
    text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
  }
  if (!response.ok) {
    return { ok: false, reason: `target answered ${response.status}: ${text.slice(0, 300)}` };
  }
  if (contentType !== "application/json") {
    return { ok: false, reason: `target answered '${contentType || "no content type"}', expected application/json` };
  }
  try {
    return { ok: true, status: response.status, body: text.length === 0 ? null : (JSON.parse(text) as unknown) };
  } catch {
    return { ok: false, reason: "response is not valid JSON" };
  }
}
