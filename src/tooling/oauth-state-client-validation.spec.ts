import { describe, expect, it } from "vitest";

import {
  createDurableObjectOAuthKvNamespace,
  createDurableObjectOAuthStore,
} from "../durable-objects/oauth-state-client.js";

function createFetcher(response: Response) {
  return {
    fetch() {
      return Promise.resolve(response);
    },
  };
}

describe("Durable Object OAuth state client validation", () => {
  it("rejects malformed authorization code responses", async () => {
    const store = createDurableObjectOAuthStore(
      createFetcher(
        Response.json({
          code: "code-1",
          used: false,
        }),
      ),
    );

    await expect(store.getAuthorizationCode("code-1")).rejects.toThrow(
      "OAuth state response body is invalid.",
    );
  });

  it("rejects malformed refresh token rotation responses", async () => {
    const store = createDurableObjectOAuthStore(
      createFetcher(
        Response.json({
          status: "rotated",
        }),
      ),
    );

    await expect(store.rotateRefreshToken("refresh-1")).rejects.toThrow(
      "OAuth state response body is invalid.",
    );
  });

  it("rejects malformed KV list responses", async () => {
    const namespace = createDurableObjectOAuthKvNamespace(
      createFetcher(
        Response.json({
          keys: [{ value: "not-a-kv-key" }],
          list_complete: true,
        }),
      ),
    );

    await expect(namespace.list()).rejects.toThrow(
      "OAuth state response body is invalid.",
    );
  });
});
