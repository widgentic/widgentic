/**
 * The outbound-request discipline every server-side fetch shares: https
 * only, the target resolved and checked against private/reserved ranges,
 * the connection PINNED to the validated address (so a DNS answer that
 * changes between check and connect has nothing to bind to), bounded time
 * and bytes. The image inliner and http actions both build on this.
 */
import { BlockList, isIPv4, isIPv6 } from "node:net";
import { errorMessage } from "../shared/error-message.js";
import type { BuiltRequest } from "../actions/index.js";

/**
 * Request init for the pinned transport: `address`/`family` name the exact
 * validated socket target. The default transport MUST connect there; test
 * fakes (which are plain fetch-shaped) may ignore them.
 */
export interface PinnedRequestInit extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  address: string;
  family: 4 | 6;
  /** Socket idle timeout for the default transport (the caller's `signal` carries the total deadline). */
  timeoutMs?: number;
}

export type PinnedFetch = (url: string, init: PinnedRequestInit) => Promise<Response>;
export type Lookup = (hostname: string) => Promise<string[]>;

/**
 * Non-public ranges, checked with Node's `BlockList` so every textual form
 * (compressed, uncompressed, mixed case) is parsed rather than
 * pattern-matched. IPv6 forms that EMBED an IPv4 address (mapped, compat,
 * NAT64, 6to4) are additionally checked on the embedded address — the
 * hand-written matcher this replaces let `[::ffff:7f00:1]` through.
 */
const blocked = new BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3]
] as const) {
  blocked.addSubnet(addr, prefix, "ipv4");
}
// No `::ffff:0:0/96` rule here: BlockList checks IPv4 addresses as mapped
// IPv6 too, so that rule would block EVERY IPv4 address. Mapped, compat,
// NAT64 and 6to4 literals are judged by their embedded IPv4 below.
// NAT64 (64:ff9b::/96) and 6to4 (2002::/16) are judged by the IPv4 they
// embed rather than blocked wholesale — a public embedded address is a
// legitimate public target.
for (const [addr, prefix] of [
  ["::", 128], ["::1", 128], ["::", 96],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]
] as const) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

/** The IPv4 address an IPv6 literal embeds (mapped/compat/NAT64/6to4), if any. */
function embeddedIpv4(address: string): string | undefined {
  const bytes = ipv6Bytes(address);
  if (bytes === undefined) return undefined;
  const v4 = (offset: number) => bytes.slice(offset, offset + 4).join(".");
  const zero = (from: number, to: number) => bytes.slice(from, to).every((b) => b === 0);
  if (zero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return v4(12); // ::ffff:a.b.c.d
  if (zero(0, 12) && !(zero(12, 15) && (bytes[15] === 0 || bytes[15] === 1))) return v4(12); // ::a.b.c.d (compat), not ::/::1
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && zero(4, 12)) return v4(12); // 64:ff9b::a.b.c.d
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return v4(2); // 2002:AABB:CCDD:: → a.b.c.d
  return undefined;
}

/** Parse an IPv6 literal into 16 bytes (undefined when malformed). */
function ipv6Bytes(address: string): number[] | undefined {
  if (!isIPv6(address)) return undefined;
  let text = address.split("%")[0] ?? address;
  const v4Tail = /:(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4Tail?.[1] !== undefined) {
    const parts = v4Tail[1].split(".").map(Number);
    text = text.slice(0, -v4Tail[1].length) + [(parts[0]! << 8) | parts[1]!, (parts[2]! << 8) | parts[3]!].map((n) => n.toString(16)).join(":");
  }
  const [head, tail] = text.split("::");
  const heads = head === "" ? [] : head!.split(":");
  const tails = tail === undefined ? [] : tail === "" ? [] : tail.split(":");
  const missing = 8 - heads.length - tails.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return undefined;
  const groups = [...heads, ...Array<string>(missing).fill("0"), ...tails].map((g) => parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return undefined;
  return groups.flatMap((g) => [g >> 8, g & 0xff]);
}

/** True for loopback, private, link-local, CGNAT, documentation, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const literal = address.replace(/^\[|\]$/g, "");
  const family = isIPv4(literal) ? "ipv4" : isIPv6(literal) ? "ipv6" : undefined;
  if (family === undefined) return true; // unparsable — treat as unsafe
  if (blocked.check(literal, family)) return true;
  if (family === "ipv6") {
    const inner = embeddedIpv4(literal);
    if (inner !== undefined && isPrivateAddress(inner)) return true;
  }
  return false;
}

function isIpLiteral(hostname: string): boolean {
  return isIPv4(hostname) || isIPv6(hostname);
}

export async function defaultLookup(hostname: string): Promise<string[]> {
  const { lookup } = await import("node:dns/promises");
  const results = await lookup(hostname, { all: true, order: "verbatim" });
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
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  const body = typeof init.body === "string" ? init.body : undefined;
  if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body, "utf8"));
  return new Promise<Response>((resolve, reject) => {
    // The caller's deadline wins over any socket progress.
    const signal = init.signal ?? undefined;
    const onAbort = (): void => {
      req.destroy(new Error("request deadline exceeded"));
    };
    if (signal?.aborted) {
      reject(new Error("request deadline exceeded"));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
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
        try {
          const status = res.statusCode ?? 0;
          const responseHeaders = new Headers();
          for (const name of ["content-type", "content-length", "location"]) {
            const value = res.headers[name];
            if (typeof value === "string") responseHeaders.set(name, value);
          }
          const bodyless = [204, 205, 304].includes(status);
          const responseBody = bodyless
            ? (res.resume(), null)
            : (Readable.toWeb(res) as unknown as BodyInit);
          resolve(new Response(responseBody, { status, headers: responseHeaders }));
        } catch (error) {
          reject(error);
        }
      }
    );
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.on("close", () => signal?.removeEventListener("abort", onAbort));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** Injectable transport, resolver and deadline, so tests run without network or DNS. */
export interface GuardedFetchDeps {
  fetchImpl?: PinnedFetch;
  lookupImpl?: Lookup;
  /** Total deadline override (default {@link ACTION_TIMEOUT_MS}). */
  timeoutMs?: number;
}

export const ACTION_TIMEOUT_MS = 8_000;
export const ACTION_MAX_BYTES = 256 * 1024;

export type GuardedJsonResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; reason: string };

/**
 * Perform an http action's request under the action fetch policy: https
 * only, public pinned target, NO redirects, one 8 s deadline covering
 * connection, headers, body and parse, 256 KiB, JSON body required (an
 * empty or 204 body is `null`). Never throws; failures carry a reason the
 * caller redacts.
 */
export async function guardedJsonFetch(
  built: BuiltRequest,
  deps: GuardedFetchDeps = {}
): Promise<GuardedJsonResult> {
  const fetchImpl = deps.fetchImpl ?? pinnedHttpsFetch;
  const lookupImpl = deps.lookupImpl ?? defaultLookup;
  const timeoutMs = deps.timeoutMs ?? ACTION_TIMEOUT_MS;
  const deadline = AbortSignal.timeout(timeoutMs);
  const expired = (): GuardedJsonResult => ({ ok: false, reason: `request deadline exceeded (${timeoutMs} ms)` });
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
      signal: deadline,
      timeoutMs,
      address: pinned.address,
      family: pinned.family
    });
  } catch (error) {
    return deadline.aborted ? expired() : { ok: false, reason: `request failed: ${errorMessage(error)}` };
  }
  const drain = () => response.body?.cancel().catch(() => undefined);
  if (response.status >= 300 && response.status < 400) {
    await drain();
    return { ok: false, reason: `target answered a redirect (${response.status}); redirects are not followed` };
  }
  // Headers decide before any body byte is read: type, size, emptiness.
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  const isJson = JSON_MEDIA_TYPE.test(contentType);
  const empty = response.status === 204 || response.body === null;
  if (response.ok && !empty && !isJson) {
    await drain();
    return { ok: false, reason: `target answered '${contentType || "no content type"}', expected application/json` };
  }
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > ACTION_MAX_BYTES) {
    await drain();
    return { ok: false, reason: `response exceeds ${ACTION_MAX_BYTES} bytes` };
  }
  let text = "";
  if (!empty) {
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    const abort = new Promise<never>((_, reject) => {
      deadline.addEventListener("abort", () => reject(new Error("request deadline exceeded")), { once: true });
    });
    try {
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), abort]);
        if (done) break;
        total += value.byteLength;
        if (total > ACTION_MAX_BYTES) {
          await reader.cancel().catch(() => undefined);
          return { ok: false, reason: `response exceeds ${ACTION_MAX_BYTES} bytes` };
        }
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      return deadline.aborted ? expired() : { ok: false, reason: `reading the response failed: ${errorMessage(error)}` };
    }
    text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
  }
  if (!response.ok) {
    return { ok: false, reason: `target answered ${response.status}: ${text.slice(0, 300)}` };
  }
  if (text.length === 0) return { ok: true, status: response.status, body: null };
  try {
    return { ok: true, status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "response is not valid JSON" };
  }
}

/** `application/json` and structured-syntax variants such as `application/problem+json`. */
const JSON_MEDIA_TYPE = /^application\/([\w.+-]+\+)?json$/;
