import { describe, expect, it } from "vitest";

import {
  createDurableObjectOAuthKvNamespace,
  createDurableObjectOAuthStore,
  type AtomicOAuthKvNamespace,
} from "../../src/durable-objects/oauth-state-client.js";
import {
  createMemoryOAuthStateStorage,
  handleOAuthStateRequest,
} from "../../src/durable-objects/oauth-state-handler.js";

function createStore() {
  const storage = createMemoryOAuthStateStorage();

  return createDurableObjectOAuthStore({
    async fetch(input, init) {
      const request =
        input instanceof Request ? input : new Request(input, init);

      return handleOAuthStateRequest(storage, request);
    },
  });
}

function createKvNamespace() {
  const storage = createMemoryOAuthStateStorage();

  return createDurableObjectOAuthKvNamespace({
    async fetch(input, init) {
      const request =
        input instanceof Request ? input : new Request(input, init);

      return handleOAuthStateRequest(storage, request);
    },
  }) as AtomicOAuthKvNamespace;
}

describe("oauth state store contract", () => {
  it("stores and retrieves registered clients and access tokens through the DO store adapter", async () => {
    // DEFECT: the durable-object store adapter can drift from the handler routes and silently stop round-tripping persisted OAuth records.
    const store = createStore();

    await store.registerClient({
      clientId: "client-1",
      clientIdIssuedAt: 1,
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      responseTypes: ["code"],
      scopes: ["mcp"],
      tokenEndpointAuthMethod: "none",
    });
    await store.issueAccessToken({
      audience: "https://mcp.example.com/mcp",
      clientId: "client-1",
      expiresAt: 10,
      issuedAt: 1,
      issuer: "https://mcp.example.com/",
      jti: "jti-1",
      scopes: ["mcp"],
      token: "access-1",
    });

    await expect(store.getRegisteredClient("client-1")).resolves.toMatchObject({
      clientId: "client-1",
      scopes: ["mcp"],
    });
    await expect(store.getAccessToken("access-1")).resolves.toMatchObject({
      token: "access-1",
      clientId: "client-1",
    });
  });

  it("returns an authorization code once and then treats it as consumed", async () => {
    // DEFECT: one-time authorization codes can remain redeemable if the store adapter fails to respect the consume-once route semantics.
    const store = createStore();

    await store.issueAuthorizationCode({
      clientId: "client-1",
      code: "code-1",
      codeChallenge: "challenge-1",
      expiresAt: 10,
      resource: "https://mcp.example.com/mcp",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      scopes: ["mcp"],
      used: false,
    });

    await expect(store.getAuthorizationCode("code-1")).resolves.toMatchObject({
      code: "code-1",
      used: false,
    });
    await expect(store.useAuthorizationCode("code-1")).resolves.toMatchObject({
      code: "code-1",
      used: false,
    });
    await expect(store.useAuthorizationCode("code-1")).resolves.toBeUndefined();
  });

  it("allows exactly one winner when the same authorization code is consumed in parallel", async () => {
    // DEFECT: concurrent authorization-code redemption can let multiple callers win if the adapter stops preserving one-time semantics.
    const store = createStore();

    await store.issueAuthorizationCode({
      clientId: "client-1",
      code: "code-parallel-1",
      codeChallenge: "challenge-1",
      expiresAt: 10,
      resource: "https://mcp.example.com/mcp",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      scopes: ["mcp"],
      used: false,
    });

    const results = await Promise.all([
      store.useAuthorizationCode("code-parallel-1"),
      store.useAuthorizationCode("code-parallel-1"),
    ]);
    const successfulRedemptions = results.filter(
      (entry) => entry?.code === "code-parallel-1",
    );
    const rejectedRedemptions = results.filter((entry) => entry === undefined);

    expect(successfulRedemptions).toHaveLength(1);
    expect(rejectedRedemptions).toHaveLength(1);
  });

  it("marks refresh token families as replay-detected after a reused token is seen", async () => {
    // DEFECT: refresh token replay can fail to poison the whole family when the store adapter and handler disagree on rotation state.
    const store = createStore();

    await store.issueRefreshToken({
      clientId: "client-1",
      expiresAt: 10,
      familyId: "family-1",
      resource: "https://mcp.example.com/mcp",
      scopes: ["mcp"],
      token: "refresh-1",
      used: false,
    });

    await expect(store.rotateRefreshToken("refresh-1")).resolves.toEqual({
      record: {
        clientId: "client-1",
        expiresAt: 10,
        familyId: "family-1",
        resource: "https://mcp.example.com/mcp",
        scopes: ["mcp"],
        token: "refresh-1",
        used: false,
      },
      status: "rotated",
    });
    await expect(store.rotateRefreshToken("refresh-1")).resolves.toMatchObject({
      status: "replay_detected",
    });
    await expect(store.rotateRefreshToken("refresh-1")).resolves.toMatchObject({
      status: "replay_detected",
    });
  });

  it("allows exactly one successful refresh-token rotation under parallel reuse", async () => {
    // DEFECT: concurrent refresh-token rotation can mint multiple descendants from the same parent token.
    const store = createStore();

    await store.issueRefreshToken({
      clientId: "client-1",
      expiresAt: 10,
      familyId: "family-parallel-1",
      resource: "https://mcp.example.com/mcp",
      scopes: ["mcp"],
      token: "refresh-parallel-1",
      used: false,
    });

    const results = await Promise.all([
      store.rotateRefreshToken("refresh-parallel-1"),
      store.rotateRefreshToken("refresh-parallel-1"),
    ]);
    const rotated = results.filter((entry) => entry.status === "rotated");
    const replayDetected = results.filter(
      (entry) => entry.status === "replay_detected",
    );

    expect(rotated).toHaveLength(1);
    expect(replayDetected).toHaveLength(1);
  });

  it("atomically consumes KV records once under parallel access", async () => {
    // DEFECT: Access OIDC pending auth state can be reused if consume is implemented as separate get and delete calls.
    const kv = createKvNamespace();

    await kv.put(
      "pending-access-auth-1",
      JSON.stringify({ clientId: "client-1" }),
    );

    const results = await Promise.all([
      kv.consume("pending-access-auth-1", { type: "json" }),
      kv.consume("pending-access-auth-1", { type: "json" }),
    ]);
    const winners = results.filter((entry) => entry !== null);
    const losers = results.filter((entry) => entry === null);

    expect(winners).toEqual([{ clientId: "client-1" }]);
    expect(losers).toHaveLength(1);
  });
});
