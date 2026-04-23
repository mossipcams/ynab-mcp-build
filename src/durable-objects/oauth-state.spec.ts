import { describe, expect, it } from "vitest";

import {
  createMemoryOAuthStateStorage,
  handleOAuthStateRequest
} from "./oauth-state-handler.js";

describe("oauth state durable-object handler", () => {
  it("stores and retrieves registered clients", async () => {
    const storage = createMemoryOAuthStateStorage();

    await handleOAuthStateRequest(
      storage,
      new Request("https://oauth-state/clients", {
        method: "POST",
        body: JSON.stringify({
          clientId: "client-1",
          clientIdIssuedAt: 1,
          grantTypes: ["authorization_code"],
          redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
          responseTypes: ["code"],
          scopes: ["mcp"],
          tokenEndpointAuthMethod: "none"
        })
      })
    );

    const response = await handleOAuthStateRequest(
      storage,
      new Request("https://oauth-state/clients/client-1")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      clientId: "client-1",
      scopes: ["mcp"]
    });
  });

  it("marks authorization codes as used when consumed but allows refresh token reuse", async () => {
    const storage = createMemoryOAuthStateStorage();

    await handleOAuthStateRequest(
      storage,
      new Request("https://oauth-state/authorization-codes", {
        method: "POST",
        body: JSON.stringify({
          clientId: "client-1",
          code: "code-1",
          codeChallenge: "challenge-1",
          expiresAt: 10,
          redirectUri: "https://claude.ai/api/mcp/auth_callback",
          scopes: ["mcp"],
          used: false
        })
      })
    );
    await handleOAuthStateRequest(
      storage,
      new Request("https://oauth-state/refresh-tokens", {
        method: "POST",
        body: JSON.stringify({
          clientId: "client-1",
          expiresAt: 10,
          scopes: ["mcp"],
          token: "refresh-1",
          used: false
        })
      })
    );

    const firstCodeResponse = await handleOAuthStateRequest(
      storage,
      new Request("https://oauth-state/authorization-codes/use", {
        method: "POST",
        body: JSON.stringify({
          code: "code-1"
        })
      })
    );
    const secondCodeResponse = await handleOAuthStateRequest(
      storage,
      new Request("https://oauth-state/authorization-codes/use", {
        method: "POST",
        body: JSON.stringify({
          code: "code-1"
        })
      })
    );
    const firstRefreshResponse = await handleOAuthStateRequest(
      storage,
      new Request("https://oauth-state/refresh-tokens/rotate", {
        method: "POST",
        body: JSON.stringify({
          token: "refresh-1"
        })
      })
    );
    const secondRefreshResponse = await handleOAuthStateRequest(
      storage,
      new Request("https://oauth-state/refresh-tokens/rotate", {
        method: "POST",
        body: JSON.stringify({
          token: "refresh-1"
        })
      })
    );

    expect(firstCodeResponse.status).toBe(200);
    expect(secondCodeResponse.status).toBe(404);
    expect(firstRefreshResponse.status).toBe(200);
    expect(secondRefreshResponse.status).toBe(200);
  });
});
