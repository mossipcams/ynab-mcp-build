import { describe, expect, it } from "vitest";

import {
  authorizeClient,
  createOAuthEnv,
  exchangeCode,
  exchangeRefreshToken,
  registerClient
} from "../../helpers/oauth-provider.js";

describe("oauth http token", () => {
  it("exchanges an authorized MCP client code for a bearer token", async () => {
    const env = createOAuthEnv();
    const { registration } = await registerClient(env);
    const { code } = await authorizeClient(env, registration.client_id);

    const { payload, response } = await exchangeCode(env, registration.client_id, code ?? "");

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      scope: "mcp",
      token_type: "bearer"
    });
    expect(payload.access_token).toEqual(expect.any(String));
    expect(payload.access_token).not.toHaveLength(0);
    expect(payload.refresh_token).toEqual(expect.any(String));
  });

  it("keeps the advertised refresh-token grant usable for registered clients", async () => {
    const env = createOAuthEnv();
    const { registration } = await registerClient(env);
    const { code } = await authorizeClient(env, registration.client_id);
    const initial = await exchangeCode(env, registration.client_id, code ?? "");

    const refreshed = await exchangeRefreshToken(
      env,
      registration.client_id,
      initial.payload.refresh_token ?? ""
    );

    expect(initial.response.status).toBe(200);
    expect(refreshed.response.status).toBe(200);
    expect(refreshed.payload).toMatchObject({
      scope: "mcp",
      token_type: "bearer"
    });
    expect(refreshed.payload.access_token).toEqual(expect.any(String));
  });
});
