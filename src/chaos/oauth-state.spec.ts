import { describe, expect, it } from "vitest";

import { handleOAuthStateRequest } from "../durable-objects/oauth-state-handler.js";

describe("OAuth state chaos", () => {
  it("returns a stable JSON error when OAuth state storage is unavailable", async () => {
    const failingStorage: Parameters<typeof handleOAuthStateRequest>[0] = {
      delete: async () => undefined,
      get: async () => {
        throw new Error("Durable Object storage unavailable");
      },
      list: async () => new Map(),
      put: async () => undefined
    };
    const response = await handleOAuthStateRequest(
      failingStorage,
      new Request("https://state.example.test/clients/client-1")
    );

    await expect(response.json()).resolves.toEqual({
      error: "oauth_state_store_unavailable",
      error_description: "Durable Object storage unavailable"
    });
    expect(response.status).toBe(500);
  });
});
