import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const oauthRoutesPath = fileURLToPath(
  new URL("../oauth/http/routes.ts", import.meta.url),
);

describe("OAuth HTTP boundary", () => {
  it("keeps Access OIDC authorization policy in the OAuth core layer", async () => {
    const source = await readFile(oauthRoutesPath, "utf8");

    expect(source).not.toContain("ACCESS_OIDC_SCOPE");
    expect(source).not.toContain("PENDING_ACCESS_AUTH");
    expect(source).not.toContain("function getGrantedScopes");
    expect(source).not.toContain("function validateAuthorizationCodePkce");
  });
});
