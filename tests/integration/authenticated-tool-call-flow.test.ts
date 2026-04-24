import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../src/app/create-app.js";
import { createInMemoryOAuthStore } from "../../src/oauth/core/store.js";

function createOAuthEnv(): Env {
  return {
    JWT_SIGNING_KEY: "test-signing-key",
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

describe("authenticated tool call integration", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("calls an authenticated MCP tool after a successful oauth exchange", async () => {
    // DEFECT: a valid OAuth token can still fail to produce a usable authenticated MCP session.
    const app = createApp({
      createId: (() => {
        const values = [
          "client-1",
          "auth-code-1",
          "refresh-token-1",
          "jti-1"
        ];

        return () => values.shift() ?? crypto.randomUUID();
      })(),
      oauthStore: createInMemoryOAuthStore()
    });
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
      `http://localhost/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&resource=${encodeURIComponent("https://mcp.example.com/mcp")}&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&state=client-state-1`,
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
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          resource: "https://mcp.example.com/mcp"
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

    const tools = await client.listTools();
    const result = await client.callTool({
      name: "ynab_get_mcp_version",
      arguments: {}
    });
    const textContent = result.content.find((entry) => entry.type === "text");

    expect(tokenResponse.status).toBe(200);
    expect(tools.tools.some((tool) => tool.name === "ynab_get_mcp_version")).toBe(true);
    expect(textContent).toBeDefined();
    expect(JSON.parse((textContent as { text: string }).text)).toMatchObject({
      name: "ynab-mcp-build",
      version: "0.1.0"
    });
  });
});
