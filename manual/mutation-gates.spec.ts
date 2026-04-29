import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../", import.meta.url);

const importRootModule = async <T>(path: string) =>
  import(pathToFileURL(new URL(path, rootUrl).pathname).href) as Promise<T>;

describe("mutation test tooling", () => {
  it("mutates the calibrated manual TypeScript surface without mutating specs", async () => {
    const { default: strykerConfig } = await importRootModule<{
      default: {
        mutate?: string[];
        thresholds?: {
          break?: number;
          high?: number;
          low?: number;
        };
      };
    }>("stryker.config.mjs");

    expect(strykerConfig.thresholds).toEqual({
      break: 86,
      high: 86,
      low: 86,
    });
    expect(strykerConfig.mutate).toEqual([
      "src/mcp/discovery.ts",
      "src/mcp/server.ts",
      "src/mcp/tool-registry.ts",
      "src/platform/ynab/mappers.ts",
      "src/platform/ynab/read-model/client.ts",
      "src/platform/ynab/read-model/money-movements-repository.ts",
      "src/shared/collections.ts",
      "src/shared/plans.ts",
      "src/shared/tool-definition.ts",
      "src/slices/db-money-movements/service.ts",
      "src/slices/financial-health/helpers.ts",
      "src/slices/meta/service.ts",
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
      "tests/slices/**/{service,mappers,schemas,helpers}.test.ts",
    ]);
  });
});
