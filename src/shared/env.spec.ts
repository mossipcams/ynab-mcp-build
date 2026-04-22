import { describe, expect, it } from "vitest";

import { resolveAppEnv } from "./env.js";

describe("resolveAppEnv", () => {
  it("uses YNAB_API_TOKEN as a fallback alias for YNAB access token", () => {
    const env = resolveAppEnv({
      YNAB_API_BASE_URL: "https://api.ynab.com/v1",
      YNAB_API_TOKEN: "alias-token"
    } as Partial<Env> & { YNAB_API_TOKEN: string });

    expect(env.ynabAccessToken).toBe("alias-token");
  });

  it("prefers YNAB_ACCESS_TOKEN when both secret names are present", () => {
    const env = resolveAppEnv({
      YNAB_ACCESS_TOKEN: "primary-token",
      YNAB_API_BASE_URL: "https://api.ynab.com/v1",
      YNAB_API_TOKEN: "alias-token"
    } as Partial<Env> & { YNAB_API_TOKEN: string });

    expect(env.ynabAccessToken).toBe("primary-token");
  });
});
