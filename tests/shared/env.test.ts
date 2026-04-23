import { describe, expect, it } from "vitest";

import { resolveAppEnv } from "../../src/shared/env.js";

describe("resolveAppEnv", () => {
  it("throws when self-hosted Access auth is enabled without a configured audience", () => {
    // DEFECT: Access JWT validation can be enabled without an app audience and accept tokens not scoped to this application.
    expect(() =>
      resolveAppEnv({
        CF_ACCESS_TEAM_DOMAIN: "https://access-team.example.com",
        YNAB_API_BASE_URL: "https://api.ynab.com/v1"
      } as Partial<Env> & { CF_ACCESS_TEAM_DOMAIN: string })
    ).toThrowError("CF_ACCESS_AUD is required when CF_ACCESS_TEAM_DOMAIN is set.");
  });
});
