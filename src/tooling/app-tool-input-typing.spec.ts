import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const toolDefinitionsPath = join(
  process.cwd(),
  "src",
  "app",
  "tool-definitions.ts",
);

describe("app tool input typing", () => {
  it("reads user input properties through a guard instead of object-shape casts", () => {
    const source = readFileSync(toolDefinitionsPath, "utf8");

    expect(source).not.toContain("input as { planId?: unknown }");
    expect(source).not.toContain("input as { month?: unknown }");
  });
});
