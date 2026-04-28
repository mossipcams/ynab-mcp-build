import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const rootUrl = new URL("../../", import.meta.url);

const readRootFile = (path: string) =>
  readFileSync(new URL(path, rootUrl), "utf8");

const importRootModule = async <T>(path: string) =>
  import(pathToFileURL(new URL(path, rootUrl).pathname).href) as Promise<T>;

describe("repository preflight tooling", () => {
  it("exposes one shared CI command sequence", async () => {
    // DEFECT: local preflight and PR automation can omit a repository quality gate that CI is expected to enforce.
    const { CI_COMMANDS } = await importRootModule<{
      CI_COMMANDS: readonly string[];
    }>("scripts/preflight.mjs");

    expect(CI_COMMANDS).toEqual([
      "npm run cf-typegen",
      "npm run typecheck",
      "npm run typecheck:spec",
      "npm run check:duplication",
      "npm test"
    ]);
  });

  it("declares Node ambient types for tooling tests", () => {
    // DEFECT: tooling tests can lose Node ambient declarations needed for repository-level file inspection.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.devDependencies).toHaveProperty("@types/node");
  });

  it("declares jscpd as the copy-paste detection tool", () => {
    // DEFECT: duplication checks can become non-reproducible if jscpd is not pinned in repository dev dependencies.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.devDependencies).toHaveProperty("jscpd");
  });

  it("wires package scripts to the shared preflight entrypoints", () => {
    // DEFECT: package metadata can stop exposing the shared local preflight automation entrypoints.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      ci: "node scripts/run-ci.mjs",
      "hooks:install": "node scripts/install-hooks.mjs",
      prepare: "node scripts/install-hooks.mjs",
      pr: "node scripts/pre-pr.mjs"
    });
  });

  it("wires a package script for copy-paste detection", () => {
    // DEFECT: duplication checks can be omitted from preflight if package scripts do not expose a stable command.
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts).toMatchObject({
      "check:duplication": "jscpd"
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
      path: ["src"]
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

  it("runs the shared CI command before pushing", () => {
    // DEFECT: local git hooks can bypass the shared preflight suite before code reaches the remote branch.
    expect(readRootFile(".githooks/pre-push")).toContain("npm run ci");
  });

  it("runs CI before creating a GitHub pull request", () => {
    // DEFECT: PR creation can bypass the shared preflight suite and open a branch with known local failures.
    const prePrScript = readRootFile("scripts/pre-pr.mjs");

    expect(prePrScript.indexOf("const ciStatus = runCi();")).toBeLessThan(
      prePrScript.indexOf("gh pr create")
    );
  });

  it("configures the Worker cron that refreshes the D1 read model", () => {
    // DEFECT: scheduled read-model freshness can be lost if the Worker cron trigger is removed or changed unexpectedly.
    const wranglerConfig = JSON.parse(readRootFile("wrangler.jsonc")) as {
      triggers?: {
        crons?: string[];
      };
    };

    expect(wranglerConfig.triggers?.crons).toEqual(["*/15 * * * *"]);
  });
});
