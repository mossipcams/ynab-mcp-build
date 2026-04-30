import { describe, expect, it } from "vitest";

import { resolveAppEnv } from "../../src/shared/env.js";

describe("resolveAppEnv", () => {
  it("ignores legacy Cloudflare Access JWT assertion env vars", () => {
    expect(() =>
      resolveAppEnv({
        CF_ACCESS_TEAM_DOMAIN: "https://access-team.example.com",
        YNAB_API_BASE_URL: "https://api.ynab.com/v1",
      } as Partial<Env> & { CF_ACCESS_TEAM_DOMAIN: string }),
    ).not.toThrow();

    const env = resolveAppEnv({
      CF_ACCESS_AUD: "legacy-access-audience",
      CF_ACCESS_TEAM_DOMAIN: "https://access-team.example.com",
      YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    } as Partial<Env> & {
      CF_ACCESS_AUD: string;
      CF_ACCESS_TEAM_DOMAIN: string;
    });

    expect(env).not.toHaveProperty("cfAccessAudience");
    expect(env).not.toHaveProperty("cfAccessTeamDomain");
  });
});
