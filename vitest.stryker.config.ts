import { defineConfig } from "vitest/config";

const unitIncludes = [
  "tests/architecture/**/*.test.ts",
  "src/shared/**/*.spec.ts",
  "src/mcp/**/*.spec.ts",
  "src/oauth/**/*.spec.ts",
  "src/platform/ynab/{client,delta-client}.spec.ts",
  "src/platform/ynab/read-model/**/*.spec.ts",
  "src/slices/**/*.spec.ts",
  "tests/oauth/core/**/*.test.ts",
  "tests/platform/ynab/client.test.ts",
  "tests/platform/ynab/mappers.test.ts",
  "tests/platform/ynab/schemas.test.ts",
  "tests/shared/**/*.test.ts",
  "tests/slices/**/{service,mappers,schemas,helpers}.test.ts"
];

export default defineConfig({
  test: {
    globals: true,
    include: unitIncludes
  }
});
