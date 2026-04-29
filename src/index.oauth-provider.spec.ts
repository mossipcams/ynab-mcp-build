import { describe, expect, it, vi } from "vitest";

import worker from "./index.js";

function createMemoryKvNamespace(): KVNamespace {
  const records = new Map<string, string>();

  return {
    async get(key: string, options?: { type?: string }) {
      const value = records.get(key);

      if (!value) {
        return null;
      }

      return options?.type === "json" ? JSON.parse(value) : value;
    },
    async put(key: string, value: string) {
      records.set(key, value);
    },
    async delete(key: string) {
      records.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const keys = [...records.keys()].filter((name) =>
        options?.prefix ? name.startsWith(options.prefix) : true
      );

      return {
        keys: keys.map((name) => ({ name })),
        list_complete: true
      };
    }
  } as unknown as KVNamespace;
}

function createOAuthProviderEnv(): Env {
  return {
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    OAUTH_KV: createMemoryKvNamespace(),
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

describe("Worker OAuth provider", () => {
  it("exposes a scheduled handler for Cloudflare cron refreshes", async () => {
    const waitUntil = vi.fn();

    worker.scheduled!(
      { cron: "0 * * * *", scheduledTime: 1777406400000 } as ScheduledController,
      { YNAB_READ_SOURCE: "live" } as unknown as Env,
      { waitUntil } as unknown as ExecutionContext
    );

    expect(waitUntil).toHaveBeenCalledTimes(1);
    const [scheduledPromise] = waitUntil.mock.calls[0] ?? [];

    expect(scheduledPromise).toBeDefined();
    await expect(scheduledPromise).resolves.toEqual({
      reason: "YNAB_READ_SOURCE is not d1.",
      status: "skipped"
    });
  });

  it("protects MCP requests with the Cloudflare OAuth provider", async () => {
    const response = await worker.fetch(
      new Request("https://mcp.example.com/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/list",
          params: {}
        })
      }),
      createOAuthProviderEnv(),
      {} as ExecutionContext
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('Bearer realm="OAuth"');
  });

  it("serves Cloudflare OAuth provider metadata with S256 PKCE", async () => {
    const response = await worker.fetch(
      new Request("https://mcp.example.com/.well-known/oauth-authorization-server"),
      createOAuthProviderEnv(),
      {} as ExecutionContext
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      code_challenge_methods_supported: ["S256"],
      registration_endpoint: "https://mcp.example.com/register",
      scopes_supported: ["mcp"],
      token_endpoint: "https://mcp.example.com/token"
    });
  });

  it("registers public clients through the Cloudflare OAuth provider", async () => {
    const response = await worker.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none"
        })
      }),
      createOAuthProviderEnv(),
      {} as ExecutionContext
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      client_name: "Claude",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    });
  });

  it("completes the authorization-code flow through the Cloudflare OAuth provider", async () => {
    const env = createOAuthProviderEnv();
    const registrationResponse = await worker.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none"
        })
      }),
      env,
      {} as ExecutionContext
    );
    const registration = await registrationResponse.json() as {
      client_id: string;
    };

    expect(
      await (env as unknown as { OAUTH_KV: KVNamespace }).OAUTH_KV.get(
        `client:${registration.client_id}`,
        { type: "json" }
      )
    ).toBeTruthy();
    const authorizeResponse = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&scope=mcp&state=client-state-1`
      ),
      env,
      {} as ExecutionContext
    );
    const redirectLocation = authorizeResponse.headers.get("location");
    const code = redirectLocation ? new URL(redirectLocation).searchParams.get("code") : null;
    const tokenResponse = await worker.fetch(
      new Request("https://mcp.example.com/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code: code ?? "",
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback"
        }).toString()
      }),
      env,
      {} as ExecutionContext
    );

    expect(authorizeResponse.status).toBe(302);
    expect(redirectLocation).toContain("state=client-state-1");
    expect(code).toBeTruthy();
    expect(tokenResponse.status).toBe(200);
    await expect(tokenResponse.json()).resolves.toMatchObject({
      scope: "mcp",
      token_type: "bearer"
    });
  });

  it("rejects provider-issued access tokens that do not grant the MCP scope", async () => {
    const env = createOAuthProviderEnv();
    const executionContext = {} as ExecutionContext;
    const registrationResponse = await worker.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none"
        })
      }),
      env,
      executionContext
    );
    const registration = await registrationResponse.json() as {
      client_id: string;
    };
    const authorizeResponse = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&scope=mcp&state=client-state-1`
      ),
      env,
      executionContext
    );
    const redirectLocation = authorizeResponse.headers.get("location");
    const code = redirectLocation ? new URL(redirectLocation).searchParams.get("code") : null;
    const tokenResponse = await worker.fetch(
      new Request("https://mcp.example.com/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code: code ?? "",
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          scope: "not-mcp"
        }).toString()
      }),
      env,
      executionContext
    );
    const tokenPayload = await tokenResponse.json() as {
      access_token: string;
      scope: string;
    };
    const mcpResponse = await worker.fetch(
      new Request("https://mcp.example.com/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${tokenPayload.access_token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/list",
          params: {}
        })
      }),
      env,
      executionContext
    );

    expect(tokenPayload.scope).toBe("");
    expect(mcpResponse.status).toBe(403);
    await expect(mcpResponse.json()).resolves.toMatchObject({
      error: "insufficient_scope",
      error_description: "Bearer token does not grant the mcp scope."
    });
  });
});
