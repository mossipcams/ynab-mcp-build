import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../", import.meta.url);

const readRootFile = (path: string) =>
  readFileSync(new URL(path, rootUrl), "utf8");

const importRootModule = async <T>(path: string) =>
  import(pathToFileURL(new URL(path, rootUrl).pathname).href) as Promise<T>;

describe("manual resilience tooling gates", () => {
  it("wires a dedicated chaos testing command", () => {
    // DEFECT: resilience tests can be skipped when chaos scenarios do not have a stable package entrypoint.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      scripts?: Record<string, string>;
    };
    const chaosConfig = readRootFile("vitest.chaos.config.ts");

    expect(packageJson.scripts).toMatchObject({
      "test:chaos": "vitest run --config vitest.chaos.config.ts"
    });
    expect(chaosConfig).toContain('"src/chaos/**/*.spec.ts"');
    expect(chaosConfig).toContain("cloudflareTest");
  });

  it("enforces an 86 percent mutation testing gate on the calibrated mutation scope", async () => {
    // DEFECT: mutation testing can report weak assertions without failing the manual quality gate.
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
      low: 86
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
      "src/slices/meta/service.ts"
    ]);
  });
});
