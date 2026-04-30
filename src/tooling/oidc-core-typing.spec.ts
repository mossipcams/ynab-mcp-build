import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const oidcCorePath = join(process.cwd(), "src", "oauth", "core", "oidc.ts");

describe("OIDC core typing", () => {
  it("derives parsed JWT claim types from schemas without trust-boundary casts", () => {
    const source = readFileSync(oidcCorePath, "utf8");

    expect(source).not.toContain("schema.parse(rawPayload) as T");
    expect(source).not.toContain("parts as [");
    expect(source).not.toContain("as Uint8Array<ArrayBuffer>");
  });
});
