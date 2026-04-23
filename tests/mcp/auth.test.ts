import { describe, expect, it } from "vitest";

import { createApp } from "../../src/app/create-app.js";
import { signJwt } from "../../src/oauth/core/jwt.js";
import { createInMemoryOAuthStore } from "../../src/oauth/core/store.js";

function createOauthEnv(): Env {
  return {
    JWT_SIGNING_KEY: "test-signing-key",
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

function createToolListRequest(headers?: HeadersInit) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "tools/list",
      params: {}
    })
  });
}

describe("mcp bearer auth", () => {
  it("returns a complete non-streamed 401 for unauthenticated GET /mcp requests", async () => {
    // DEFECT: the server can start the GET stream handshake before rejecting a missing bearer token.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.fetch(
      new Request("http://localhost/mcp", {
        method: "GET",
        headers: {
          accept: "text/event-stream"
        }
      }),
      createOauthEnv()
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-type")).not.toContain("text/event-stream");
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="mcp", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"'
    );
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_token"
    });
  });

  it("returns a complete 401 response before stream establishment when authorization is missing", async () => {
    // DEFECT: the server can begin MCP stream setup before rejecting missing bearer auth and leak transport state.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });
    const response = await app.fetch(createToolListRequest(), createOauthEnv());

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="mcp", resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"'
    );
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_token"
    });
  });

  it("rejects jwt tokens signed with the wrong key", async () => {
    // DEFECT: bearer verification can accept tokens whose signature was created by a different issuer key.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });
    const token = await signJwt(
      {
        aud: "https://mcp.example.com/mcp",
        exp: Math.floor(Date.UTC(2026, 3, 22, 13, 0, 0) / 1000),
        iat: Math.floor(Date.UTC(2026, 3, 22, 12, 0, 0) / 1000),
        iss: "https://mcp.example.com/",
        jti: "jti-1",
        scope: "mcp",
        sub: "client-1"
      },
      "wrong-signing-key"
    );

    const response = await app.fetch(
      createToolListRequest({
        authorization: `Bearer ${token}`
      }),
      createOauthEnv()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_token"
    });
  });

  it("rejects jwt tokens with the wrong audience", async () => {
    // DEFECT: a valid token for one protected resource can be replayed against a different MCP server.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });
    const token = await signJwt(
      {
        aud: "https://other.example.com/mcp",
        exp: Math.floor(Date.UTC(2026, 3, 22, 13, 0, 0) / 1000),
        iat: Math.floor(Date.UTC(2026, 3, 22, 12, 0, 0) / 1000),
        iss: "https://mcp.example.com/",
        jti: "jti-2",
        scope: "mcp",
        sub: "client-1"
      },
      "test-signing-key"
    );

    const response = await app.fetch(
      createToolListRequest({
        authorization: `Bearer ${token}`
      }),
      createOauthEnv()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_token"
    });
  });

  it("rejects expired bearer tokens", async () => {
    // DEFECT: expired bearer tokens can continue to authorize MCP requests after their intended lifetime.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });
    const token = await signJwt(
      {
        aud: "https://mcp.example.com/mcp",
        exp: Math.floor(Date.UTC(2026, 3, 22, 11, 59, 0) / 1000),
        iat: Math.floor(Date.UTC(2026, 3, 22, 11, 0, 0) / 1000),
        iss: "https://mcp.example.com/",
        jti: "jti-expired",
        scope: "mcp",
        sub: "client-1"
      },
      "test-signing-key"
    );

    const response = await app.fetch(
      createToolListRequest({
        authorization: `Bearer ${token}`
      }),
      createOauthEnv()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_token"
    });
  });

  it("rejects alg=none bearer tokens", async () => {
    // DEFECT: unsigned jwt tokens can slip through bearer validation when the server trusts header-declared algorithms.
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }), "utf8").toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        aud: "https://mcp.example.com/mcp",
        exp: Math.floor(Date.UTC(2026, 3, 22, 13, 0, 0) / 1000),
        iat: Math.floor(Date.UTC(2026, 3, 22, 12, 0, 0) / 1000),
        iss: "https://mcp.example.com/",
        jti: "jti-3",
        scope: "mcp",
        sub: "client-1"
      }),
      "utf8"
    ).toString("base64url");
    const token = `${header}.${payload}.`;
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.fetch(
      createToolListRequest({
        authorization: `Bearer ${token}`
      }),
      createOauthEnv()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_token"
    });
  });

  it("rejects bearer tokens that do not grant the mcp scope", async () => {
    // DEFECT: a valid bearer token can authorize MCP requests even when it omits the scope required for tool access.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });
    const token = await signJwt(
      {
        aud: "https://mcp.example.com/mcp",
        exp: Math.floor(Date.UTC(2030, 0, 1, 0, 0, 0) / 1000),
        iat: Math.floor(Date.UTC(2026, 3, 23, 12, 0, 0) / 1000),
        iss: "https://mcp.example.com/",
        jti: "jti-no-scope",
        scope: "accounts:read",
        sub: "client-1"
      },
      "test-signing-key"
    );

    const response = await app.fetch(
      createToolListRequest({
        authorization: `Bearer ${token}`
      }),
      createOauthEnv()
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    await expect(response.json()).resolves.toMatchObject({
      error: "insufficient_scope"
    });
  });
});
