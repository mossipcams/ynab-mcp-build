import { describe, expect, it } from "vitest";

import {
  createOAuthEnv,
  fetchWorker,
  MCP_ORIGIN
} from "../../helpers/oauth-provider.js";

describe("oauth provider configuration", () => {
  it("does not expose provider discovery routes when OAuth mode is disabled", async () => {
    const response = await fetchWorker(
      new Request(`${MCP_ORIGIN}/.well-known/oauth-authorization-server`),
      createOAuthEnv({
        MCP_OAUTH_ENABLED: "false"
      } as Partial<Env>)
    );

    expect(response.status).toBe(404);
  });

  it("keeps self-hosted provider discovery active even when Cloudflare Access env vars exist", async () => {
    const response = await fetchWorker(
      new Request(`${MCP_ORIGIN}/.well-known/oauth-authorization-server`),
      createOAuthEnv({
        CF_ACCESS_AUD: "access-app-audience",
        CF_ACCESS_TEAM_DOMAIN: "https://mossipcams.cloudflareaccess.com"
      } as Partial<Env>)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      issuer: MCP_ORIGIN,
      registration_endpoint: `${MCP_ORIGIN}/register`
    });
  });
});
