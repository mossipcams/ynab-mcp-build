import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("durable object bindings", () => {
  it("exports only Durable Object classes that are bound in wrangler config", () => {
    const indexSource = readFileSync("src/index.ts", "utf8");
    const wranglerSource = readFileSync("wrangler.jsonc", "utf8");
    const exportedClasses = Array.from(indexSource.matchAll(/export\s+\{\s*([^}]+)\s*\}/gu))
      .flatMap((match) => match[1]!.split(",").map((name) => name.trim()))
      .filter((name) => name.endsWith("DO"));
    const boundClasses = Array.from(wranglerSource.matchAll(/"class_name":\s*"([^"]+)"/gu))
      .map((match) => match[1]);

    expect(exportedClasses.sort()).toEqual(boundClasses.sort());
  });
});
