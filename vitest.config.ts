import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig, defineProject } from "vitest/config";

const unitIncludes = [
  "tests/architecture/**/*.test.ts",
  "tests/oauth/core/**/*.test.ts",
  "tests/platform/ynab/mappers.test.ts",
  "tests/platform/ynab/schemas.test.ts",
  "tests/shared/**/*.test.ts",
  "tests/slices/**/{service,mappers,schemas,helpers}.test.ts"
];

const workersIncludes = [
  "tests/durable-objects/**/*.test.ts",
  "tests/http/routes/**/*.test.ts",
  "tests/integration/**/*.test.ts",
  "tests/mcp/**/*.test.ts",
  "tests/oauth/http/**/*.test.ts",
  "tests/platform/ynab/client.test.ts",
  "tests/security/**/*.test.ts"
];

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc"
      }
    })
  ],
  test: {
    globals: true,
    projects: [
      defineProject({
        test: {
          include: unitIncludes,
          name: "unit"
        }
      }),
      defineProject({
        test: {
          include: workersIncludes,
          name: "workers"
        }
      })
    ]
  }
});
