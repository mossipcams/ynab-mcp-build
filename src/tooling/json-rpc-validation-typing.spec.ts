import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const validationPath = join(
  process.cwd(),
  "src",
  "mcp",
  "json-rpc-validation.ts",
);

describe("JSON-RPC validation typing", () => {
  it("narrows tool-call envelopes without object-shape casts", () => {
    const source = readFileSync(validationPath, "utf8");

    expect(source).not.toContain("parsedBody as");
  });
});
