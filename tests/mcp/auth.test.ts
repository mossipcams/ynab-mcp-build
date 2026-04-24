import { describe, expect, it } from "vitest";

import {
  createOAuthEnv,
  fetchWorker,
  issueToken,
  MCP_ORIGIN,
  MCP_RESOURCE
} from "../helpers/oauth-provider.js";

function createToolListRequest(headers?: HeadersInit) {
  return new Request(MCP_RESOURCE, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
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

describe("mcp oauth provider auth", () => {
  it("rejects unauthenticated MCP stream requests before reaching the transport", async () => {
    const response = await fetchWorker(
      new Request(MCP_RESOURCE, {
        method: "GET",
        headers: {
          accept: "text/event-stream"
        }
      }),
      createOAuthEnv()
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).not.toContain("text/event-stream");
    expect(response.headers.get("www-authenticate")).toContain('Bearer realm="OAuth"');
    expect(response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${MCP_ORIGIN}/.well-known/oauth-protected-resource/mcp"`
    );
  });

  it("rejects unauthenticated MCP JSON-RPC requests at the provider boundary", async () => {
    const response = await fetchWorker(createToolListRequest(), createOAuthEnv());

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('Bearer realm="OAuth"');
  });

  it("rejects random bearer tokens at the provider boundary", async () => {
    const response = await fetchWorker(
      createToolListRequest({
        authorization: "Bearer not-a-provider-token"
      }),
      createOAuthEnv()
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("allows MCP requests with a provider-issued access token", async () => {
    const env = createOAuthEnv();
    const { accessToken } = await issueToken(env);
    const response = await fetchWorker(
      createToolListRequest({
        authorization: `Bearer ${accessToken}`
      }),
      env
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });
});
