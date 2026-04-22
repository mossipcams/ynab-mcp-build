import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach } from "vitest";

import { describe, expect, it } from "vitest";

import { createApp } from "../../app/create-app.js";
import { createInMemoryOAuthStore } from "../../oauth/core/store.js";

function createOAuthEnv(): Env {
  return {
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

describe("oauth routes", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("serves OAuth authorization-server metadata when OAuth mode is enabled", async () => {
    const app = createApp();
    const response = await app.request(
      "http://localhost/.well-known/oauth-authorization-server",
      undefined,
      createOAuthEnv()
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      issuer: "https://mcp.example.com/",
      registration_endpoint: "https://mcp.example.com/register",
      response_types_supported: ["code"],
      scopes_supported: ["mcp"],
      token_endpoint: "https://mcp.example.com/token",
      token_endpoint_auth_methods_supported: ["none"]
    });
  });

  it("registers a public client with a single redirect URI", async () => {
    const app = createApp();
    const response = await app.request(
      "http://localhost/register",
      {
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
      },
      createOAuthEnv()
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

  it("requires OAuth access tokens for MCP when OAuth mode is enabled", async () => {
    const app = createApp({
      createId: (() => {
        const values = [
          "client-1",
          "auth-code-1",
          "access-token-1",
          "refresh-token-1"
        ];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
    const unauthorizedResponse = await app.request(
      "http://localhost/mcp",
      {
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
      },
      createOAuthEnv()
    );

    expect(unauthorizedResponse.status).toBe(401);
    expect(unauthorizedResponse.headers.get("www-authenticate")).toContain(
      "resource_metadata=\"https://mcp.example.com/.well-known/oauth-protected-resource/mcp\""
    );

    const registrationResponse = await app.request(
      "http://localhost/register",
      {
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
      },
      createOAuthEnv()
    );
    const registration = await registrationResponse.json() as {
      client_id: string;
    };
    const authorizeResponse = await app.request(
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&state=client-state-1`,
      undefined,
      createOAuthEnv()
    );
    const redirectLocation = authorizeResponse.headers.get("location");
    const code = redirectLocation ? new URL(redirectLocation).searchParams.get("code") : null;
    const tokenResponse = await app.request(
      "http://localhost/token",
      {
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
      },
      createOAuthEnv()
    );
    const tokenPayload = await tokenResponse.json() as {
      access_token: string;
    };
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const headers = new Headers(request.headers);

        headers.set("authorization", `Bearer ${tokenPayload.access_token}`);

        return app.fetch(
          new Request(request, {
            headers
          }),
          createOAuthEnv()
        );
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const result = await client.callTool({
      name: "ynab_get_mcp_version",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(tokenResponse.status).toBe(200);
    expect(textContent).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      name: "ynab-mcp-build",
      version: "0.1.0"
    });
  });
});
