/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
const config = {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  reporters: ["clear-text", "progress", "html"],
  mutate: [
    "src/oauth/core/**/*.ts",
    "src/platform/ynab/mappers.ts",
    "src/platform/ynab/schemas.ts",
    "src/slices/**/helpers.ts",
    "src/slices/**/service.ts"
  ],
  vitest: {
    configFile: "vitest.stryker.config.ts",
    related: true
  }
};

export default config;
