import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig, defineProject } from "vitest/config";

const unitIncludes = [
  "tests/architecture/**/*.test.ts",
  "src/tooling/**/*.spec.ts",
  "tests/platform/ynab/client.test.ts",
  "tests/platform/ynab/mappers.test.ts",
  "tests/platform/ynab/schemas.test.ts",
  "tests/shared/**/*.test.ts",
  "tests/slices/**/{service,mappers,schemas,helpers}.test.ts"
];

const workersIncludes = [
  "src/app/dependencies.spec.ts",
  "src/http/routes/oauth.spec.ts",
  "src/index.oauth-provider.spec.ts",
  "src/shared/env.oauth-provider.spec.ts",
  "tests/durable-objects/**/*.test.ts",
  "tests/http/routes/**/*.test.ts",
  "tests/integration/**/*.test.ts",
  "tests/mcp/**/*.test.ts",
  "tests/oauth/http/**/*.test.ts",
  "tests/security/**/*.test.ts"
];

export default defineConfig({
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
        plugins: [
          cloudflareTest({
            wrangler: {
              configPath: "./wrangler.jsonc"
            }
          })
        ],
        test: {
          include: workersIncludes,
          name: "workers"
        }
      })
    ]
  }
});
