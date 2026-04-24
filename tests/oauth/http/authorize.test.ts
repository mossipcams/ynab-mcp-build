import { describe, expect, it } from "vitest";

import {
  authorizeClient,
  createOAuthEnv,
  REDIRECT_URI,
  registerClient,
  requestAuthorization
} from "../../helpers/oauth-provider.js";

describe("oauth http authorize", () => {
  it("authorizes a registered MCP client and preserves client state", async () => {
    const env = createOAuthEnv();
    const { registration } = await registerClient(env);
    const { code, location, response } = await authorizeClient(env, registration.client_id);

    expect(response.status).toBe(302);
    expect(location).toContain(`${REDIRECT_URI}?`);
    expect(code).toEqual(expect.any(String));
    expect(code).not.toHaveLength(0);
    expect(location).toContain("state=client-state-1");
  });

  it("rejects scopes that this MCP server does not grant", async () => {
    const env = createOAuthEnv();
    const { registration } = await registerClient(env);
    const response = await requestAuthorization(env, registration.client_id, {
      scope: "mcp admin"
    });
    const payload = await response.json() as { error: string; error_description: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("invalid_request");
    expect(payload.error_description).toBe("Requested scope is not supported: admin");
  });

  it("sanitizes authorization errors before returning them to clients", async () => {
    const env = createOAuthEnv();
    const { registration } = await registerClient(env);
    const response = await requestAuthorization(env, registration.client_id, {
      scope: "mcp /Users/matt/secret"
    });
    const payload = await response.json() as { error: string; error_description: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("invalid_request");
    expect(payload.error_description).toContain("[REDACTED_PATH]");
    expect(payload.error_description).not.toContain("/Users/matt/secret");
  });
});
