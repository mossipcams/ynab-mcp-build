import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../../", import.meta.url);

const readRootFile = (path: string) =>
  readFileSync(new URL(path, rootUrl), "utf8");

const parseRootJsonc = <T>(path: string) =>
  JSON.parse(readRootFile(path).replace(/,\s*([}\]])/g, "$1")) as T;

const importRootModule = async <T>(path: string) =>
  import(pathToFileURL(new URL(path, rootUrl).pathname).href) as Promise<T>;

describe("repository preflight tooling", () => {
  it("exposes one shared CI command sequence", async () => {
    // DEFECT: local preflight and PR automation can omit a repository quality gate that CI is expected to enforce.
    const { CI_COMMANDS } = await importRootModule<{
      CI_COMMANDS: readonly string[];
    }>("scripts/preflight.mjs");

    expect(CI_COMMANDS).toEqual(["pnpm check:pr"]);
  });

  it("declares Node ambient types for tooling tests", () => {
    // DEFECT: tooling tests can lose Node ambient declarations needed for repository-level file inspection.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.devDependencies).toHaveProperty("@types/node");
  });

  it("enables strict TypeScript safety flags", () => {
    // DEFECT: weaker compiler settings allow generated code to skip nullish, return-path, and control-flow checks.
    const tsconfig = JSON.parse(readRootFile("tsconfig.json")) as {
      compilerOptions?: Record<string, unknown>;
    };

    expect(tsconfig.compilerOptions).toMatchObject({
      exactOptionalPropertyTypes: true,
      noFallthroughCasesInSwitch: true,
      noImplicitOverride: true,
      noImplicitReturns: true,
      noUncheckedIndexedAccess: true,
      strict: true,
    });
  });

  it("declares jscpd as the copy-paste detection tool", () => {
    // DEFECT: duplication checks can become non-reproducible if jscpd is not pinned in repository dev dependencies.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.devDependencies).toHaveProperty("jscpd");
  });

  it("declares knip as the unused-code detection tool", () => {
    // DEFECT: unused-code checks can become non-reproducible if knip is not pinned in repository dev dependencies.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.devDependencies).toHaveProperty("knip");
    expect(packageJson.scripts).toMatchObject({
      "check:knip": "knip",
    });
  });

  it("declares type-aware ESLint tooling", () => {
    // DEFECT: lint rules that require TypeScript type information can silently disappear from local and CI checks.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.devDependencies).toHaveProperty("@eslint/js");
    expect(packageJson.devDependencies).toHaveProperty("eslint");
    expect(packageJson.devDependencies).toHaveProperty("typescript-eslint");
  });

  it("declares fast native TypeScript and oxlint tooling", () => {
    // DEFECT: the fast local feedback loop can fall back to slower JS-based tooling without a reproducible package pin.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.devDependencies).toHaveProperty(
      "@typescript/native-preview",
    );
    expect(packageJson.devDependencies).toHaveProperty("oxlint");
    expect(packageJson.devDependencies).toHaveProperty("oxlint-tsgolint");
  });

  it("wires package scripts to the shared preflight entrypoints", () => {
    // DEFECT: package metadata can stop exposing the shared local preflight automation entrypoints.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.devDependencies).toHaveProperty("husky");
    expect(packageJson.scripts).toMatchObject({
      ci: "node scripts/run-ci.mjs",
      "hooks:install": "husky",
      prepare: "husky",
      pr: "node scripts/pre-pr.mjs",
    });
  });

  it("wires a package script for copy-paste detection", () => {
    // DEFECT: duplication checks can be omitted from preflight if package scripts do not expose a stable command.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      "check:duplication": "jscpd",
    });
  });

  it("wires a package script for type-aware linting", () => {
    // DEFECT: ESLint can be configured but omitted from reproducible package-level quality gates.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      lint: "pnpm lint:types",
      "lint:fast": "oxlint .",
      "lint:types": "eslint . --cache --max-warnings=0",
    });
  });

  it("wires package scripts for native and stable TypeScript checks", () => {
    // DEFECT: fast native type-checking can replace the stable compiler gate without a clear fallback.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      "pretypecheck:tsgo": "pnpm run typegen",
      typecheck: "tsc --noEmit",
      "typecheck:tsc": "tsc --noEmit -p tsconfig.json",
      "typecheck:tsgo": "tsgo --noEmit -p tsconfig.json",
    });
  });

  it("documents the fast feedback philosophy for future agents", () => {
    // DEFECT: future tooling changes can drift away from the repository's agreed fast-fail workflow.
    const agents = readRootFile("AGENTS.md");

    expect(agents).toContain("test often, fail fast, fix fast");
    expect(agents).toContain("pnpm run typecheck:tsgo");
    expect(agents).toContain("pnpm run lint:fast");
    expect(agents).toContain("pnpm run typecheck:tsc");
  });

  it("configures the required type-aware ESLint rules", async () => {
    // DEFECT: unsafe any usage, floating promises, and non-exhaustive switches can slip through generated code.
    const config = await importRootModule<{
      default: Array<{ rules?: Record<string, unknown> }>;
    }>("eslint.config.mjs");
    const mergedRules = Object.assign(
      {},
      ...config.default.map((entry) => entry.rules ?? {}),
    );

    expect(mergedRules).toMatchObject({
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/require-await": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "error",
    });
  });

  it("configures jscpd to scan production TypeScript", () => {
    // DEFECT: copy-paste detection can silently scan tests or non-TypeScript files instead of production TypeScript.
    const jscpdConfig = JSON.parse(readRootFile(".jscpd.json")) as {
      format?: string[];
      ignore?: string[];
      path?: string[];
    };

    expect(jscpdConfig).toMatchObject({
      format: ["typescript"],
      path: ["src"],
    });
    expect(jscpdConfig.ignore).toContain("**/*.spec.ts");
  });

  it("configures jscpd with the agreed duplication baseline", () => {
    // DEFECT: copy-paste detection can lose its agreed duplication threshold and stop failing on regressions.
    const jscpdConfig = JSON.parse(readRootFile(".jscpd.json")) as {
      threshold?: number;
    };

    expect(jscpdConfig.threshold).toBe(6);
  });

  it("runs fast feedback checks before committing", () => {
    // DEFECT: local git hooks can allow commits that fail the agreed fast typecheck and lint loop.
    const preCommitHook = readRootFile(".husky/pre-commit");

    expect(preCommitHook).toContain("pnpm run typecheck:tsgo");
    expect(preCommitHook).toContain("pnpm run lint:fast");
  });

  it("runs the shared CI command before pushing through Husky", () => {
    // DEFECT: local git hooks can bypass the shared preflight suite before code reaches the remote branch.
    expect(readRootFile(".husky/pre-push")).toContain("pnpm check:prepr");
  });

  it("sets up pnpm before GitHub Actions configures the pnpm cache", () => {
    // DEFECT: GitHub-hosted runners cannot restore a pnpm cache before the pnpm executable is available.
    const workflow = readRootFile(".github/workflows/ci.yml");

    expect(workflow.indexOf("- uses: pnpm/action-setup@v4")).toBeLessThan(
      workflow.indexOf("cache: pnpm"),
    );
  });

  it("runs GitHub Actions on pushes to main", () => {
    // DEFECT: main branch merges can skip CI and deployment when the workflow only handles pull requests.
    const workflow = readRootFile(".github/workflows/ci.yml");

    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches:");
    expect(workflow).toContain("- main");
  });

  it("deploys the Worker after the main branch quality gate", () => {
    // DEFECT: production Workers can stay stale when CI validates PRs but never deploys successful main merges.
    const workflow = readRootFile(".github/workflows/ci.yml");

    expect(workflow).toContain("deploy:");
    expect(workflow).toContain("needs: quality-gate");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("pnpm exec wrangler deploy");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID");
  });

  it("runs CI before creating a GitHub pull request", () => {
    // DEFECT: PR creation can bypass the shared preflight suite and open a branch with known local failures.
    const prePrScript = readRootFile("scripts/pre-pr.mjs");

    expect(prePrScript.indexOf("const ciStatus = runCi();")).toBeLessThan(
      prePrScript.indexOf("gh pr create"),
    );
  });

  it("configures the Worker cron that refreshes the D1 read model", () => {
    // DEFECT: scheduled read-model freshness can be lost if the Worker cron trigger is removed or changed unexpectedly.
    const wranglerConfig = parseRootJsonc<{
      triggers?: {
        crons?: string[];
      };
    }>("wrangler.jsonc");

    expect(wranglerConfig.triggers?.crons).toEqual(["0 * * * *"]);
  });

  it("keeps README DB-backed tool status current", () => {
    // DEFECT: stale DB-backed documentation can tell operators that production tools are unavailable.
    const readme = readRootFile("README.md");

    expect(readme).toContain(
      "All advertised normal MCP tools are registered in D1 mode",
    );
    expect(readme).not.toContain(
      "Only `ynab_search_transactions` is rebuilt against D1 so far.",
    );
    expect(readme).not.toContain(
      "return a clear “not available yet in DB-backed read mode” error",
    );
  });

  it("keeps JSON-RPC tool-call validation in the MCP layer", () => {
    // DEFECT: protocol validation in HTTP routes couples transport adapters to MCP request details.
    const httpMcpRoute = readRootFile("src/http/routes/mcp.ts");

    expect(httpMcpRoute).not.toContain('from "zod"');
    expect(readRootFile("src/mcp/json-rpc-validation.ts")).toContain(
      "validateToolCallRequest",
    );
  });

  it("keeps a single MCP tool registration implementation", () => {
    // DEFECT: duplicate MCP registration modules can diverge on result formatting and schema handling.
    expect(() => readRootFile("src/mcp/tools.ts")).toThrow();
    expect(readRootFile("src/mcp/tool-registry.ts")).toContain(
      "registerToolDefinitions",
    );
  });

  it("validates OAuth JSON token payloads with Zod", () => {
    // DEFECT: JWT and JWKS payload casts can trust malformed external JSON before signature and claim checks.
    for (const path of ["src/oauth/core/jwt.ts", "src/oauth/core/oidc.ts"]) {
      const source = readRootFile(path);

      expect(source).toContain('from "zod"');
      expect(source).not.toContain("JSON.parse");
    }
  });

  it("disables non-custom Worker URLs", () => {
    const wranglerConfig = parseRootJsonc<{
      preview_urls?: boolean;
      workers_dev?: boolean;
    }>("wrangler.jsonc");

    expect(wranglerConfig.workers_dev).toBe(false);
    expect(wranglerConfig.preview_urls).toBe(false);
  });
});
