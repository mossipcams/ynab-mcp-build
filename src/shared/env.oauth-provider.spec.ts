import { describe, expect, it } from "vitest";

import { resolveAppEnv } from "./env.js";

describe("OAuth provider environment", () => {
  it("resolves the Cloudflare OAuth provider KV namespace binding", () => {
    const oauthKv = {} as KVNamespace;

    const env = resolveAppEnv({
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      OAUTH_KV: oauthKv,
      YNAB_API_BASE_URL: "https://api.ynab.com/v1"
    } as unknown as Env);

    expect(env.oauthKvNamespace).toBe(oauthKv);
  });

  it("requires DO-backed OAuth state unless a test KV store is injected", () => {
    expect(() =>
      resolveAppEnv({
        MCP_OAUTH_ENABLED: "true",
        MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
        YNAB_API_BASE_URL: "https://api.ynab.com/v1"
      } as unknown as Env)
    ).toThrowError(
      "OAuth requires a Durable Object namespace or an injected OAuth KV store when MCP_OAUTH_ENABLED is true."
    );
  });

  it("resolves the canonical Durable Object OAuth state binding", () => {
    const oauthState = {} as DurableObjectNamespace;

    const env = resolveAppEnv({
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      OAUTH_STATE: oauthState,
      YNAB_API_BASE_URL: "https://api.ynab.com/v1"
    } as unknown as Env);

    expect(env.oauthStateNamespace).toBe(oauthState);
  });

  it("resolves Cloudflare Access OIDC upstream configuration", () => {
    const env = resolveAppEnv({
      ACCESS_CLIENT_ID: "access-client-id",
      ACCESS_CLIENT_SECRET: "access-client-secret",
      ACCESS_TEAM_DOMAIN: "access-team.example.com",
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      OAUTH_KV: {} as KVNamespace,
      YNAB_API_BASE_URL: "https://api.ynab.com/v1"
    } as unknown as Env);

    expect(env.accessOidc).toMatchObject({
      clientId: "access-client-id",
      clientSecret: "access-client-secret",
      discoveryUrl: "https://access-team.example.com/cdn-cgi/access/sso/oidc/access-client-id/.well-known/openid-configuration",
      teamDomain: "access-team.example.com"
    });
  });

  it("allows explicit Cloudflare Access OIDC endpoint overrides", () => {
    const env = resolveAppEnv({
      ACCESS_AUTHORIZATION_URL: "https://access.example.com/authorize",
      ACCESS_CLIENT_ID: "access-client-id",
      ACCESS_CLIENT_SECRET: "access-client-secret",
      ACCESS_JWKS_URL: "https://access.example.com/certs",
      ACCESS_TEAM_DOMAIN: "access-team.example.com",
      ACCESS_TOKEN_URL: "https://access.example.com/token",
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      OAUTH_KV: {} as KVNamespace,
      YNAB_API_BASE_URL: "https://api.ynab.com/v1"
    } as unknown as Env);

    expect(env.accessOidc).toMatchObject({
      authorizationUrl: "https://access.example.com/authorize",
      jwksUrl: "https://access.example.com/certs",
      tokenUrl: "https://access.example.com/token"
    });
  });
});
