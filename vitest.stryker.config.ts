import { defineConfig } from "vitest/config";

const unitIncludes = [
  "tests/architecture/**/*.test.ts",
  "tests/oauth/core/**/*.test.ts",
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
