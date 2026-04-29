import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  createOAuthEnv,
  fetchWorker,
  issueToken,
} from "../helpers/oauth-provider.js";

describe("authenticated tool call integration", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("lets a provider-issued OAuth token call MCP tools", async () => {
    const env = createOAuthEnv();
    const { accessToken, tokenResponse } = await issueToken(env);
    const transport = new StreamableHTTPClientTransport(
      new URL("http://localhost/mcp"),
      {
        fetch: async (input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init);
          const headers = new Headers(request.headers);

          headers.set("authorization", `Bearer ${accessToken}`);

          return fetchWorker(
            new Request(request, {
              headers,
            }),
            env,
          );
        },
      },
    );
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0",
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport);

    const tools = await client.listTools();
    const result = await client.callTool({
      name: "ynab_get_mcp_version",
      arguments: {},
    });
    const textContent = result.content.find((entry) => entry.type === "text");

    expect(tokenResponse.status).toBe(200);
    expect(
      tools.tools.some((tool) => tool.name === "ynab_get_mcp_version"),
    ).toBe(true);
    expect(textContent).toBeDefined();
    expect(JSON.parse((textContent as { text: string }).text)).toMatchObject({
      name: "ynab-mcp-build",
      version: "0.1.0",
    });
  });
});
