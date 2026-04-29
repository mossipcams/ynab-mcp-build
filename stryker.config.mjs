/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
const config = {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  reporters: ["clear-text", "progress", "html"],
  mutate: [
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
  ],
  thresholds: {
    break: 86,
    high: 86,
    low: 86,
  },
  vitest: {
    configFile: "vitest.stryker.config.ts",
    related: true,
  },
};

export default config;
