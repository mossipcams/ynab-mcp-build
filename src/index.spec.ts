import { describe, expect, it } from "vitest";

import worker from "./index.js";

function createMemoryKvNamespace() {
  const records = new Map<string, string>();

  return {
    async delete(key: string) {
      records.delete(key);
    },
    async get(key: string, options?: { type?: "json" | "text" }) {
      const value = records.get(key);

      if (value == null) {
        return null;
      }

      if (options?.type === "json") {
        return JSON.parse(value);
      }

      return value;
    },
    async list() {
      return { keys: [], list_complete: true };
    },
    async put(key: string, value: string) {
      records.set(key, value);
    }
  } as unknown as KVNamespace;
}

describe("worker entrypoint", () => {
  const publicBaseUrl = "https://mcp.example.com";

  it("serves OAuth metadata with the Cloudflare provider bindings", async () => {
    const response = await worker.fetch(
      new Request(`${publicBaseUrl}/.well-known/oauth-authorization-server`),
      {
        MCP_OAUTH_ENABLED: "true",
        MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
        MCP_SERVER_NAME: "ynab-mcp-build",
        MCP_SERVER_VERSION: "0.1.0",
        OAUTH_KV: {} as KVNamespace,
        YNAB_API_BASE_URL: "https://api.ynab.com/v1"
      } as Env,
      {} as ExecutionContext
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      registration_endpoint: "https://mcp.example.com/register",
      token_endpoint: "https://mcp.example.com/token"
    });
  });

  it("completes an authorization-code exchange through the provider endpoints", async () => {
    const env = {
      MCP_OAUTH_ENABLED: "true",
      MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
      MCP_SERVER_NAME: "ynab-mcp-build",
      MCP_SERVER_VERSION: "0.1.0",
      OAUTH_KV: createMemoryKvNamespace(),
      YNAB_API_BASE_URL: "https://api.ynab.com/v1"
    } as Env;
    const registrationResponse = await worker.fetch(
      new Request(`${publicBaseUrl}/register`, {
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
    const authorizeResponse = await worker.fetch(
      new Request(
        `${publicBaseUrl}/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&state=client-state-1`
      ),
      env,
      {} as ExecutionContext
    );
    const redirectLocation = authorizeResponse.headers.get("location");
    const code = redirectLocation ? new URL(redirectLocation).searchParams.get("code") : null;
    const tokenResponse = await worker.fetch(
      new Request(`${publicBaseUrl}/token`, {
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
        })
      }),
      env,
      {} as ExecutionContext
    );

    expect(registrationResponse.status).toBe(201);
    expect(authorizeResponse.status).toBe(302);
    expect(redirectLocation).toContain("state=client-state-1");
    expect(code).toBeTruthy();
    expect(tokenResponse.status).toBe(200);
    await expect(tokenResponse.json()).resolves.toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      token_type: "bearer"
    });
  });

  it("requires OAuth access tokens for MCP when OAuth mode is enabled", async () => {
    const response = await worker.fetch(
      new Request(`${publicBaseUrl}/mcp`, {
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
      {
        MCP_OAUTH_ENABLED: "true",
        MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
        MCP_SERVER_NAME: "ynab-mcp-build",
        MCP_SERVER_VERSION: "0.1.0",
        OAUTH_KV: createMemoryKvNamespace(),
        YNAB_API_BASE_URL: "https://api.ynab.com/v1"
      } as Env,
      {} as ExecutionContext
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"'
    );
  });
});
