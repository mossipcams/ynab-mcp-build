import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = process.cwd();
const srcDir = join(rootDir, "src");

function listSourceFiles() {
  return discoverProductionSourceFiles(srcDir);
}

function discoverProductionSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return discoverProductionSourceFiles(entryPath);
    }

    return entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".spec.ts")
      ? [entryPath]
      : [];
  });
}

function readSource(filePath: string) {
  return readFileSync(filePath, "utf8");
}

function rel(filePath: string) {
  return relative(rootDir, filePath);
}

function expectNoMatches(
  filePaths: string[],
  matcher: (source: string) => boolean,
  defect: string,
) {
  const offenders = filePaths
    .filter((filePath) => matcher(readSource(filePath)))
    .map(rel);

  expect(offenders, defect).toEqual([]);
}

const sourceFiles = listSourceFiles();
const sliceFiles = sourceFiles.filter((filePath) =>
  filePath.includes("/src/slices/"),
);
const oauthCoreFiles = sourceFiles.filter((filePath) =>
  filePath.includes("/src/oauth/core/"),
);
const mcpFiles = sourceFiles.filter((filePath) =>
  filePath.includes("/src/mcp/"),
);
const sharedFiles = sourceFiles.filter((filePath) =>
  filePath.includes("/src/shared/"),
);
const httpFiles = sourceFiles.filter((filePath) =>
  filePath.includes("/src/http/"),
);

describe("architecture boundaries", () => {
  it("covers every production source file", () => {
    // DEFECT: new platform or slice modules can miss boundary assertions when the source list drifts.
    expect(sourceFiles.map(rel).sort()).toEqual(
      discoverProductionSourceFiles(srcDir).map(rel).sort(),
    );
  });

  it("covers every OAuth production source file", () => {
    // DEFECT: new OAuth files can miss boundary assertions when the source list drifts.
    expect(
      sourceFiles
        .filter((filePath) => filePath.includes("/src/oauth/"))
        .map(rel)
        .sort(),
    ).toEqual(
      discoverProductionSourceFiles(join(srcDir, "oauth")).map(rel).sort(),
    );
  });

  it("keeps slices free of MCP, Hono, DO, and Worker env imports", () => {
    // DEFECT: slice modules can accrete transport/protocol/runtime dependencies and become impossible to test as pure business logic.
    expectNoMatches(
      sliceFiles,
      (source) =>
        /@modelcontextprotocol\//u.test(source) ||
        /from\s+["']hono["']/u.test(source) ||
        /durable-objects\//u.test(source) ||
        /\bEnv\b/u.test(source),
      "slices must stay transport- and runtime-agnostic",
    );
  });

  it("keeps oauth core free of Hono, DO, and slice imports", () => {
    // DEFECT: oauth core can become runtime-coupled and stop working in plain Node tests.
    expectNoMatches(
      oauthCoreFiles,
      (source) =>
        /from\s+["']hono["']/u.test(source) ||
        /durable-objects\//u.test(source) ||
        /slices\//u.test(source),
      "oauth core must remain runtime-agnostic",
    );
  });

  it("restricts MCP SDK imports to the MCP layer", () => {
    // DEFECT: protocol SDK usage can leak across layers and make future transport changes risky and expensive.
    const offenders = sourceFiles
      .filter(
        (filePath) =>
          !filePath.includes("/src/mcp/") &&
          !filePath.endsWith("/src/http/routes/mcp.ts"),
      )
      .filter((filePath) =>
        /@modelcontextprotocol\//u.test(readSource(filePath)),
      )
      .map(rel);

    expect(offenders).toEqual([]);
  });

  it("keeps shared helpers free of MCP result-shape knowledge", () => {
    // DEFECT: shared helpers can ossify protocol-specific response formatting and block reuse across slices and transports.
    expectNoMatches(
      sharedFiles,
      (source) =>
        /@modelcontextprotocol\//u.test(source) ||
        /\bToolResult\b/u.test(source) ||
        /isError/u.test(source) ||
        /content:\s*\[/u.test(source),
      "shared helpers must stay runtime-agnostic",
    );
  });

  it("keeps direct YNAB API fetch code in the platform layer", () => {
    // DEFECT: upstream HTTP calls can leak into feature or transport code and bypass shared auth/error handling.
    expectNoMatches(
      sourceFiles.filter(
        (filePath) => !filePath.includes("/src/platform/ynab/"),
      ),
      (source) => /fetch\s*\(/u.test(source) && /api\.ynab\.com/u.test(source),
      "direct YNAB fetches must be isolated in src/platform/ynab/**",
    );
  });

  it("keeps streamable HTTP transport code out of src/mcp", () => {
    // DEFECT: transport wiring can drift into the MCP layer and blur the seam between protocol logic and HTTP delivery.
    expectNoMatches(
      mcpFiles,
      (source) =>
        /StreamableHTTP|streamableHttp|webStandardStreamableHttp/u.test(source),
      "streamable HTTP transport belongs in src/http/routes/mcp.ts",
    );
  });

  it("keeps http routes from importing the YNAB platform directly", () => {
    // DEFECT: HTTP routes can bypass slices and start embedding product logic and platform coupling.
    expectNoMatches(
      httpFiles,
      (source) => /platform\/ynab\//u.test(source),
      "http routes must cross into business logic through slices/dependencies",
    );
  });

  it("keeps mcp modules free of Hono imports", () => {
    // DEFECT: protocol modules can become coupled to one HTTP framework and stop being reusable across transports.
    expectNoMatches(
      mcpFiles,
      (source) => /from\s+["']hono["']/u.test(source),
      "mcp modules must remain HTTP-framework agnostic",
    );
  });
});
