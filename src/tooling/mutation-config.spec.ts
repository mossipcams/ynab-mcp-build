import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRootFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("mutation testing config", () => {
  it("mutates the core TypeScript modules with direct unit coverage", () => {
    const strykerConfig = readRootFile("stryker.config.mjs");

    for (const mutationTarget of [
      "src/shared/**/*.ts",
      "src/mcp/**/*.ts",
      "src/platform/ynab/client.ts",
      "src/platform/ynab/delta-client.ts",
      "src/platform/ynab/read-model/**/*.ts"
    ]) {
      expect(strykerConfig).toContain(mutationTarget);
    }

    expect(strykerConfig).toContain("!src/**/*.spec.ts");
  });

  it("runs the direct unit specs for the expanded mutation surface", () => {
    const vitestStrykerConfig = readRootFile("vitest.stryker.config.ts");

    for (const includePattern of [
      "src/shared/**/*.spec.ts",
      "src/mcp/**/*.spec.ts",
      "src/oauth/**/*.spec.ts",
      "src/platform/ynab/{client,delta-client}.spec.ts",
      "src/platform/ynab/read-model/**/*.spec.ts",
      "src/slices/**/*.spec.ts"
    ]) {
      expect(vitestStrykerConfig).toContain(includePattern);
    }

    expect(vitestStrykerConfig).toContain("tests/platform/ynab/client.test.ts");
  });
});
