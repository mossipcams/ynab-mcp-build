import { defineConfig } from "vitest/config";

const unitIncludes = [
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
];

export default defineConfig({
  test: {
    globals: true,
    include: unitIncludes,
  },
});
