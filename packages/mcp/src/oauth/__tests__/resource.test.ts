// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  bearerChallenge,
  protectedResourceMetadata,
  protectedResourceMetadataPaths,
  protectedResourceMetadataUrl,
  readBearerToken,
  resolveCredential
} from "../resource.js";

describe("resource-side helpers", () => {
  it("the metadata names the resource and its authorization server", () => {
    expect(
      protectedResourceMetadata({ resource: "https://mcp.example/mcp", authorizationServers: ["https://example"] })
    ).toEqual({
      resource: "https://mcp.example/mcp",
      authorization_servers: ["https://example"],
      scopes_supported: ["read", "execute"],
      bearer_methods_supported: ["header"]
    });
  });

  it("the metadata is served at the path form and the root form", () => {
    expect(protectedResourceMetadataPaths("https://mcp.example/mcp")).toEqual([
      "/.well-known/oauth-protected-resource/mcp",
      "/.well-known/oauth-protected-resource"
    ]);
    expect(protectedResourceMetadataPaths("https://mcp.example/")).toEqual(["/.well-known/oauth-protected-resource"]);
    expect(protectedResourceMetadataUrl("https://mcp.example/mcp")).toBe(
      "https://mcp.example/.well-known/oauth-protected-resource/mcp"
    );
    expect(protectedResourceMetadataUrl("http://localhost:8081/mcp")).toBe(
      "http://localhost:8081/.well-known/oauth-protected-resource/mcp"
    );
  });

  it("the challenge points at the metadata, and says when a token was refused", () => {
    const resourceMetadataUrl = "https://mcp.example/.well-known/oauth-protected-resource/mcp";
    expect(bearerChallenge({ resourceMetadataUrl })).toBe(`Bearer resource_metadata="${resourceMetadataUrl}"`);
    expect(bearerChallenge({ resourceMetadataUrl, invalidToken: true })).toBe(
      `Bearer resource_metadata="${resourceMetadataUrl}", error="invalid_token"`
    );
    // A quote can never close the parameter early.
    expect(bearerChallenge({ resourceMetadataUrl: 'https://x/"y' })).toBe('Bearer resource_metadata="https://x/\\"y"');
  });

  it("only a bearer token is extracted", () => {
    expect(readBearerToken("Bearer abc")).toBe("abc");
    expect(readBearerToken("bearer abc")).toBe("abc");
    expect(readBearerToken("  BEARER   wga_0123  ")).toBe("wga_0123");
    expect(readBearerToken("Basic abc")).toBeUndefined();
    expect(readBearerToken("Bearer ")).toBeUndefined();
    expect(readBearerToken("Bearer a b")).toBeUndefined();
    expect(readBearerToken("Bearer")).toBeUndefined();
    expect(readBearerToken("")).toBeUndefined();
    expect(readBearerToken(undefined)).toBeUndefined();
    expect(readBearerToken(null)).toBeUndefined();
  });

  it("a key decides when presented, then a bearer token, and nothing resolved is a challenge", async () => {
    const resource = "https://mcp.example/mcp";
    const metadata = "https://mcp.example/.well-known/oauth-protected-resource/mcp";
    const seen: string[] = [];
    const resolvers = {
      resource,
      resolveKey: (key: string) => {
        seen.push(`key:${key}`);
        return key === "wgk_good" ? "by-key" : undefined;
      },
      resolveToken: async (token: string, options: { resource: string }) => {
        seen.push(`token:${token}@${options.resource}`);
        return token === "wga_good" ? "by-token" : undefined;
      }
    };
    expect(await resolveCredential({ apiKey: "wgk_good" }, resolvers)).toEqual({ principal: "by-key", via: "key" });
    expect(await resolveCredential({ authorization: "Bearer wga_good" }, resolvers)).toEqual({
      principal: "by-token",
      via: "token"
    });
    // A key takes precedence, and an unknown key is not rescued by a token.
    expect(await resolveCredential({ apiKey: "wgk_good", authorization: "Bearer wga_bad" }, resolvers)).toEqual({
      principal: "by-key",
      via: "key"
    });
    expect(await resolveCredential({ apiKey: "wgk_bad", authorization: "Bearer wga_good" }, resolvers)).toEqual({
      challenge: `Bearer resource_metadata="${metadata}"`,
      presented: "key"
    });
    expect(await resolveCredential({}, resolvers)).toEqual({
      challenge: `Bearer resource_metadata="${metadata}"`,
      presented: "none"
    });
    expect(await resolveCredential({ apiKey: "", authorization: "Basic abc" }, resolvers)).toEqual({
      challenge: `Bearer resource_metadata="${metadata}"`,
      presented: "none"
    });
    expect(await resolveCredential({ apiKey: null, authorization: "Bearer wga_bad" }, resolvers)).toEqual({
      challenge: `Bearer resource_metadata="${metadata}", error="invalid_token"`,
      presented: "token"
    });
    expect(seen).toEqual([
      "key:wgk_good",
      "token:wga_good@https://mcp.example/mcp",
      "key:wgk_good",
      "key:wgk_bad",
      "token:wga_bad@https://mcp.example/mcp"
    ]);
  });
});
