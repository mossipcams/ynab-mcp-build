import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../../", import.meta.url);

const importRootModule = async <T>(path: string) =>
  import(pathToFileURL(new URL(path, rootUrl).pathname).href) as Promise<T>;

describe("mutation test tooling", () => {
  it("mutates the expanded core TypeScript surface without mutating specs", async () => {
    const { default: strykerConfig } = await importRootModule<{
      default: { mutate?: string[] };
    }>("stryker.config.mjs");

    expect(strykerConfig.mutate).toEqual([
      "src/oauth/core/**/*.ts",
      "src/shared/**/*.ts",
      "src/mcp/**/*.ts",
      "src/platform/ynab/client.ts",
      "src/platform/ynab/delta-client.ts",
      "src/platform/ynab/mappers.ts",
      "src/platform/ynab/read-model/**/*.ts",
      "src/platform/ynab/schemas.ts",
      "src/slices/**/helpers.ts",
      "src/slices/**/service.ts",
      "!src/**/*.spec.ts"
    ]);
  });

  it("runs Stryker dry-runs against Node-compatible source specs and external unit tests", async () => {
    // DEFECT: stale Stryker Vitest globs can include Worker-pool specs in the plain Node mutation runner.
    const { default: vitestStrykerConfig } = await importRootModule<{
      default: { test?: { include?: string[] } };
    }>("vitest.stryker.config.ts");

    expect(vitestStrykerConfig.test?.include).toEqual([
      "src/app/**/*.spec.ts",
      "src/mcp/**/*.spec.ts",
      "src/oauth/**/*.spec.ts",
      "src/platform/**/*.spec.ts",
      "src/shared/**/*.spec.ts",
      "src/slices/**/*.spec.ts",
      "src/tooling/**/*.spec.ts",
      "tests/architecture/**/*.test.ts",
      "tests/oauth/core/**/*.test.ts",
      "tests/platform/ynab/client.test.ts",
      "tests/platform/ynab/mappers.test.ts",
      "tests/platform/ynab/schemas.test.ts",
      "tests/shared/**/*.test.ts",
      "tests/slices/**/{service,mappers,schemas,helpers}.test.ts"
    ]);
  });
});
