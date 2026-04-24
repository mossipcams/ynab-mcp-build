import { describe, expect, it } from "vitest";

import {
  authorizeClient,
  createOAuthEnv,
  exchangeCode,
  REDIRECT_URI,
  registerClient
} from "../helpers/oauth-provider.js";

describe("register-authorize-token integration", () => {
  it("composes registration, authorization, and token exchange into a usable OAuth flow", async () => {
    const env = createOAuthEnv();
    const { registration, response: registrationResponse } = await registerClient(env);
    const { code, location, response: authorizeResponse } = await authorizeClient(
      env,
      registration.client_id
    );
    const { payload: tokenPayload, response: tokenResponse } = await exchangeCode(
      env,
      registration.client_id,
      code ?? ""
    );

    expect(registrationResponse.status).toBe(201);
    expect(registration.client_id).toEqual(expect.any(String));
    expect(authorizeResponse.status).toBe(302);
    expect(location).toContain(`${REDIRECT_URI}?`);
    expect(code).toEqual(expect.any(String));
    expect(tokenResponse.status).toBe(200);
    expect(tokenPayload).toMatchObject({
      scope: "mcp",
      token_type: "bearer"
    });
    expect(tokenPayload.access_token).toEqual(expect.any(String));
  });
});
