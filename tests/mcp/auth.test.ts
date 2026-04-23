import { afterEach, describe, expect, it, vi } from "vitest";

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

function createCfAccessEnv(): Env {
  return {
    CF_ACCESS_AUD: "access-app-audience",
    CF_ACCESS_TEAM_DOMAIN: "https://access-team.example.com",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

function toBase64Url(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

async function createCfAccessJwt(input: {
  aud: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  kid?: string;
  sub?: string;
}) {
  const keyPair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1])
    },
    true,
    ["sign", "verify"]
  );
  const kid = input.kid ?? "test-kid-1";
  const header = toBase64Url(JSON.stringify({
    alg: "RS256",
    kid,
    typ: "JWT"
  }));
  const payload = toBase64Url(JSON.stringify({
    aud: input.aud,
    ...(input.email ? { email: input.email } : {}),
    exp: input.exp ?? Math.floor(Date.now() / 1000) + 60 * 60,
    iss: input.iss ?? "https://access-team.example.com",
    sub: input.sub ?? "user-1"
  }));
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput)
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  return {
    jwk: {
      ...publicJwk,
      alg: "RS256",
      kid,
      use: "sig"
    },
    token: `${signingInput}.${toBase64Url(new Uint8Array(signature))}`
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("mcp cloudflare access auth", () => {
  it("returns an unauthenticated response when the Cloudflare Access JWT assertion is missing", async () => {
    // DEFECT: self-hosted Access mode can fall through to MCP handling without proof that Cloudflare authenticated the caller.
    const app = createApp();

    const response = await app.fetch(createToolListRequest(), createCfAccessEnv());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "unauthenticated",
      error_description: "Cloudflare Access authentication required."
    });
  });

  it("accepts a valid Cloudflare Access JWT assertion for the configured audience", async () => {
    // DEFECT: self-hosted Access mode can reject legitimate Access-authenticated callers and break the managed OAuth handoff.
    const app = createApp();
    const { jwk, token } = await createCfAccessJwt({
      aud: "access-app-audience",
      email: "user@example.com"
    });

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url === "https://access-team.example.com/cdn-cgi/access/certs") {
        return Response.json({
          keys: [jwk]
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch);

    const response = await app.fetch(
      createToolListRequest({
        accept: "application/json, text/event-stream",
        "cf-access-jwt-assertion": token
      }),
      createCfAccessEnv()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });

  it("rejects Cloudflare Access JWT assertions issued for a different audience", async () => {
    // DEFECT: a valid Access token for one protected app can be replayed against this MCP server when audience binding is skipped.
    const app = createApp();
    const { jwk, token } = await createCfAccessJwt({
      aud: "other-access-app-audience"
    });

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);

      if (url === "https://access-team.example.com/cdn-cgi/access/certs") {
        return Response.json({
          keys: [jwk]
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch);

    const response = await app.fetch(
      createToolListRequest({
        accept: "application/json, text/event-stream",
        "cf-access-jwt-assertion": token
      }),
      createCfAccessEnv()
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "unauthenticated",
      error_description: "Cloudflare Access authentication required."
    });
  });
});
