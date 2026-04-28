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
    const { CI_COMMANDS } = await importRootModule<{
      CI_COMMANDS: readonly string[];
    }>("scripts/preflight.mjs");

    expect(CI_COMMANDS).toEqual([
      "npm run cf-typegen",
      "npm run typecheck",
      "npm run typecheck:spec",
      "npm test"
    ]);
  });

  it("wires package scripts to the preflight entrypoints", () => {
    const packageJson = JSON.parse(readRootFile("package.json")) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.devDependencies).toHaveProperty("@types/node");
    expect(packageJson.scripts).toMatchObject({
      ci: "node scripts/run-ci.mjs",
      "hooks:install": "node scripts/install-hooks.mjs",
      prepare: "node scripts/install-hooks.mjs",
      pr: "node scripts/pre-pr.mjs"
    });
  });

  it("runs the shared CI command before pushing", () => {
    expect(readRootFile(".githooks/pre-push")).toContain("npm run ci");
  });

  it("runs CI before creating a GitHub pull request", () => {
    const prePrScript = readRootFile("scripts/pre-pr.mjs");

    expect(prePrScript.indexOf("npm run ci")).toBeLessThan(
      prePrScript.indexOf("gh pr create")
    );
  });

  it("configures the Worker cron that refreshes the D1 read model", () => {
    const wranglerConfig = JSON.parse(readRootFile("wrangler.jsonc")) as {
      triggers?: {
        crons?: string[];
      };
    };

    expect(wranglerConfig.triggers?.crons).toEqual(["0 * * * *"]);
  });

  it("disables non-custom Worker URLs", () => {
    const wranglerConfig = JSON.parse(readRootFile("wrangler.jsonc")) as {
      preview_urls?: boolean;
      workers_dev?: boolean;
    };

    expect(wranglerConfig.workers_dev).toBe(false);
    expect(wranglerConfig.preview_urls).toBe(false);
  });
});
