// @vitest-environment node
/**
 * The direct GitHub OAuth branch (design D4 revised) against a fake
 * GitHub: authorize redirect shape, state binding, code exchange, the
 * single identity read, subject namespacing, and token hygiene.
 */
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "@widgentic/mcp/store";
import { AuthError, createAuth } from "../auth.js";
import type { AuthOptions } from "../auth.js";

const GITHUB = {
  clientId: "gh-client",
  clientSecret: "gh-secret",
  redirectUri: "https://widgentic.dev/auth/github/callback"
};

interface FakeGitHub {
  fetchImpl: typeof fetch;
  exchanged: URLSearchParams[];
  userReads: { auth: string | null; userAgent: string | null }[];
  user: { id?: number; login?: string; name?: string | null };
  tokenBody: () => unknown;
}

function fakeGitHub(): FakeGitHub {
  const state: FakeGitHub = {
    exchanged: [],
    userReads: [],
    user: { id: 7_654_321, login: "octo-dev", name: "Octo Dev" },
    tokenBody: () => ({ access_token: "gho_test_token_value" }),
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://github.com/login/oauth/access_token") {
        state.exchanged.push(new URLSearchParams(String(init?.body ?? "")));
        return Response.json(state.tokenBody());
      }
      if (url === "https://api.github.com/user") {
        const headers = new Headers(init?.headers);
        state.userReads.push({
          auth: headers.get("authorization"),
          userAgent: headers.get("user-agent")
        });
        return Response.json(state.user);
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch
  };
  return state;
}

function auth(gh: FakeGitHub, extra: Partial<AuthOptions> = {}) {
  return createAuth({
    issuer: "https://widgentictest.ciamlogin.com/tid/v2.0",
    clientId: "unused-here",
    redirectUri: "https://widgentic.dev/auth/callback",
    sessionSecret: "g".repeat(64),
    github: GITHUB,
    fetchImpl: gh.fetchImpl,
    ...extra
  });
}

/** Drive begin → callback with the matching state; returns the result. */
async function signIn(a: ReturnType<typeof createAuth>) {
  const begin = a.beginGitHubLogin();
  const state = new URL(begin.location).searchParams.get("state") as string;
  const callback = new URL(`${GITHUB.redirectUri}?code=gh-code&state=${state}`);
  return a.handleGitHubCallback(callback, begin.setCookie.split(";")[0]);
}

describe("github sign-in", () => {
  it("authorize redirect carries client id, redirect, scope, and state", () => {
    const begin = auth(fakeGitHub()).beginGitHubLogin();
    const url = new URL(begin.location);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(GITHUB.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(GITHUB.redirectUri);
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(url.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
    expect(begin.setCookie).toContain("HttpOnly");
  });

  it("full round trip: namespaced subject, display-name label, sealed session", async () => {
    const gh = fakeGitHub();
    const a = auth(gh);
    const result = await signIn(a);
    expect(result.session).toEqual({ subject: "github:7654321", label: "Octo Dev" });

    // The exchange sent the secret to GitHub (and nowhere else)…
    expect(gh.exchanged[0]?.get("client_secret")).toBe(GITHUB.clientSecret);
    expect(gh.exchanged[0]?.get("code")).toBe("gh-code");
    // …the identity read used the token once, with a UA (GitHub requires it)…
    expect(gh.userReads[0]?.auth).toBe("Bearer gho_test_token_value");
    expect(gh.userReads[0]?.userAgent).toBeTruthy();
    // …and nothing GitHub-issued leaks into the session cookie.
    expect(result.setCookie!).not.toContain("gho_test_token_value");

    const read = a.readSession(result.setCookie!.split(";")[0]);
    expect(read?.subject).toBe("github:7654321");
  });

  it("falls back to the login when the profile has no display name", async () => {
    const gh = fakeGitHub();
    gh.user = { id: 42, login: "plain-login", name: null };
    const result = await signIn(auth(gh));
    expect(result.session).toEqual({ subject: "github:42", label: "plain-login" });
  });

  it("state mismatch, missing cookie, and cross-flow cookies are refused", async () => {
    const gh = fakeGitHub();
    const a = auth(gh);
    const begin = a.beginGitHubLogin();
    const cookie = begin.setCookie.split(";")[0];

    await expect(
      a.handleGitHubCallback(new URL(`${GITHUB.redirectUri}?code=c&state=wrong`), cookie)
    ).rejects.toThrow(/state mismatch/);
    await expect(
      a.handleGitHubCallback(new URL(`${GITHUB.redirectUri}?code=c&state=s`), undefined)
    ).rejects.toThrow(/missing flow cookie/);

    // An OIDC flow cookie cannot redeem a GitHub callback, nor vice versa.
    const oidcBegin = a.beginLogin();
    const oidcState = new URL(oidcBegin.location).searchParams.get("state") as string;
    await expect(
      a.handleGitHubCallback(
        new URL(`${GITHUB.redirectUri}?code=c&state=${oidcState}`),
        oidcBegin.setCookie.split(";")[0]
      )
    ).rejects.toThrow(/wrong flow/);
    const ghState = new URL(begin.location).searchParams.get("state") as string;
    await expect(
      a.handleCallback(
        new URL(`https://widgentic.dev/auth/callback?code=c&state=${ghState}`),
        cookie
      )
    ).rejects.toThrow(/wrong flow/);
  });

  it("refuses when GitHub returns no token or a broken profile", async () => {
    const gh = fakeGitHub();
    gh.tokenBody = () => ({ error: "bad_verification_code" });
    await expect(signIn(auth(gh))).rejects.toThrow(/no github access token/);

    const gh2 = fakeGitHub();
    gh2.user = { login: "no-id" };
    await expect(signIn(auth(gh2))).rejects.toThrow(/github user has no id/);
  });

  it("throws cleanly when unconfigured", () => {
    const a = createAuth({
      issuer: "https://widgentictest.ciamlogin.com/tid/v2.0",
      clientId: "x",
      redirectUri: "https://widgentic.dev/auth/callback",
      sessionSecret: "g".repeat(64)
    });
    expect(() => a.beginGitHubLogin()).toThrow(AuthError);
  });

  it("github and email identities land on distinct principals", async () => {
    const store = createMemoryStore();
    const github = await store.ensurePrincipal("github:7654321", "Octo Dev");
    const email = await store.ensurePrincipal("oidc-sub-abc", "Octo Dev");
    expect(github.id).not.toBe(email.id);
    // Same GitHub user again → same principal.
    expect((await store.ensurePrincipal("github:7654321")).id).toBe(github.id);
  });
});
