import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const dependencyCruiserConfigPath = resolve(
  repoRoot,
  ".dependency-cruiser.cjs",
);
const packageJsonPath = resolve(repoRoot, "package.json");
const preflightPath = resolve(repoRoot, "scripts/preflight.mjs");
const ciWorkflowPath = resolve(repoRoot, ".github/workflows/ci.yml");
const require = createRequire(import.meta.url);

type DependencyCruiserRule = {
  name: string;
  severity?: string;
  from?: {
    path?: string;
    pathNot?: string;
  };
  to?: {
    path?: string;
    pathNot?: string;
    dependencyTypes?: string[];
  };
};

type DependencyCruiserConfig = {
  forbidden?: DependencyCruiserRule[];
  options?: {
    tsConfig?: {
      fileName?: string;
    };
  };
};

const loadConfig = (): DependencyCruiserConfig =>
  require(dependencyCruiserConfigPath) as DependencyCruiserConfig;

const getRule = (name: string): DependencyCruiserRule => {
  const rule = loadConfig().forbidden?.find(
    (candidate) => candidate.name === name,
  );

  expect(rule, `Missing dependency-cruiser rule: ${name}`).toBeDefined();

  return rule as DependencyCruiserRule;
};

describe("dependency-cruiser architecture enforcement", () => {
  it("has a dependency-cruiser package script and config", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(existsSync(dependencyCruiserConfigPath)).toBe(true);
    expect(packageJson.devDependencies).toHaveProperty("dependency-cruiser");
    expect(packageJson.scripts?.["check:deps"]).toBe(
      "depcruise --config .dependency-cruiser.cjs src",
    );
  });

  it("can run dependency-cruiser against the source tree", () => {
    const result = spawnSync("pnpm", ["check:deps"], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
    });

    expect(
      `${result.stdout}\n${result.stderr}`.trim(),
      "dependency-cruiser should complete without architecture violations",
    ).toContain("no dependency violations found");
    expect(result.status).toBe(0);
  });

  it("extracts TypeScript import edges instead of scanning modules only", () => {
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "depcruise",
        "--output-type",
        "json",
        "--config",
        ".dependency-cruiser.cjs",
        "src/index.ts",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        shell: false,
      },
    );
    const cruiseResult = JSON.parse(result.stdout) as {
      summary?: {
        totalDependenciesCruised?: number;
      };
    };

    expect(result.status).toBe(0);
    expect(cruiseResult.summary?.totalDependenciesCruised).toBeGreaterThan(0);
  });

  it("keeps MCP SDK imports inside the MCP layer", () => {
    const rule = getRule("mcp-sdk-owned-by-mcp-layer");

    expect(rule.from?.pathNot).toBe("^(src/mcp/|src/http/routes/mcp\\.ts$)");
    expect(rule.to?.path).toBe("^@modelcontextprotocol/");
  });

  it("keeps Hono imports out of non-HTTP composition layers", () => {
    const rule = getRule("hono-owned-by-http-and-app-layers");

    expect(rule.from?.pathNot).toBe("^(src/app/|src/http/|src/oauth/http/)");
    expect(rule.to?.path).toBe("^hono$");
  });

  it("keeps product slices decoupled from transport and runtime owners", () => {
    const rule = getRule("slices-stay-business-logic-only");

    expect(rule.from?.path).toBe("^src/slices/");
    expect(rule.to?.path).toBe(
      "^(src/http/|src/mcp/|src/oauth/|src/durable-objects/|hono$|@modelcontextprotocol/)",
    );
  });

  it("keeps OAuth core runtime agnostic", () => {
    const rule = getRule("oauth-core-stays-runtime-agnostic");

    expect(rule.from?.path).toBe("^src/oauth/core/");
    expect(rule.to?.path).toBe(
      "^(src/http/|src/oauth/http/|src/durable-objects/|src/slices/|hono$)",
    );
  });

  it("keeps Durable Objects away from routes and slices", () => {
    const rule = getRule("durable-objects-avoid-routes-and-slices");

    expect(rule.from?.path).toBe("^src/durable-objects/");
    expect(rule.to?.path).toBe("^(src/http/|src/slices/)");
  });

  it("keeps YNAB platform access out of transport and protocol layers", () => {
    const rule = getRule("ynab-platform-not-used-by-transport-or-protocol");

    expect(rule.from?.path).toBe(
      "^(src/http/|src/mcp/|src/oauth/|src/durable-objects/)",
    );
    expect(rule.to?.path).toBe("^src/platform/ynab/");
  });

  it("keeps D1 read-model access behind its repository layer", () => {
    const rule = getRule("d1-read-model-owned-by-read-model-layer");

    expect(rule.from?.pathNot).toBe(
      "^(src/app/|src/platform/ynab/read-model/|src/slices/db-)",
    );
    expect(rule.to?.path).toBe("^src/platform/ynab/read-model/");
  });

  it("wires dependency-cruiser into local and GitHub CI gates", async () => {
    const preflight = (await import(
      `${preflightPath}?cacheBust=${Date.now()}`
    )) as {
      CI_COMMANDS: string[];
    };
    const ciWorkflow = readFileSync(ciWorkflowPath, "utf8");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(preflight.CI_COMMANDS).toContain("pnpm check:pr");
    expect(packageJson.scripts?.["check:pr"]).toContain("pnpm check:deps");
    expect(ciWorkflow).toContain("pnpm check:pr");
  });
});
