import { describe, expect, it } from "vitest";

import {
  createMemoryOAuthStateStorage,
  handleOAuthStateRequest,
} from "../durable-objects/oauth-state-handler.js";

async function expectInvalidBody(response: Response) {
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    error: "invalid_request",
    error_description: "OAuth state request body is invalid.",
  });
}

describe("OAuth state request validation", () => {
  it("rejects KV consume requests without a string key", async () => {
    const response = await handleOAuthStateRequest(
      createMemoryOAuthStateStorage(),
      new Request("https://oauth-state/kv/consume", {
        body: JSON.stringify({}),
        method: "POST",
      }),
    );

    await expectInvalidBody(response);
  });

  it("rejects client records without a string client id", async () => {
    const storage = createMemoryOAuthStateStorage();
    const response = await handleOAuthStateRequest(
      storage,
      new Request("https://oauth-state/clients", {
        body: JSON.stringify({}),
        method: "POST",
      }),
    );

    await expectInvalidBody(response);
    await expect(storage.get("client:undefined")).resolves.toBeUndefined();
  });

  it("rejects token records without a string token", async () => {
    const storage = createMemoryOAuthStateStorage();
    const response = await handleOAuthStateRequest(
      storage,
      new Request("https://oauth-state/access-tokens", {
        body: JSON.stringify({}),
        method: "POST",
      }),
    );

    await expectInvalidBody(response);
    await expect(
      storage.get("access-token:undefined"),
    ).resolves.toBeUndefined();
  });

  it("rejects authorization-code use requests without a string code", async () => {
    const response = await handleOAuthStateRequest(
      createMemoryOAuthStateStorage(),
      new Request("https://oauth-state/authorization-codes/use", {
        body: JSON.stringify({}),
        method: "POST",
      }),
    );

    await expectInvalidBody(response);
  });
});
