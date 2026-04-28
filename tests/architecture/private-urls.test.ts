import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = process.cwd();
const skippedDirectories = new Set([
  ".git",
  ".stryker-tmp",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
  "reports"
]);
const skippedFiles = new Set([
  ".dev.vars",
  ".env",
  ".env.local",
  "package-lock.json",
  "worker-configuration.d.ts"
]);
const textFileExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml"
]);

function listTextFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skippedDirectories.has(entry.name)) {
      return [];
    }

    const entryPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return listTextFiles(entryPath);
    }

    if (!entry.isFile() || skippedFiles.has(entry.name)) {
      return [];
    }

    return textFileExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))
      ? [entryPath]
      : [];
  });
}

function rel(filePath: string) {
  return relative(rootDir, filePath);
}

describe("private URL exposure", () => {
  it("keeps Cloudflare tenant and worker hostnames out of repo text files", () => {
    // DEFECT: real deployment hostnames in fixtures or config expose private infrastructure in the public GitHub repo.
    const blockedHostPatterns = [
      new RegExp(String.raw`\b[a-z0-9-]+\.${[["cloudflare", "access"].join(""), "com"].join(String.raw`\.`)}\b`, "iu"),
      new RegExp(String.raw`\b[a-z0-9-]+\.[a-z0-9-]+\.${["workers", "dev"].join(String.raw`\.`)}\b`, "iu")
    ];
    const offenders = listTextFiles(rootDir)
      .filter((filePath) => blockedHostPatterns.some((pattern) => pattern.test(readFileSync(filePath, "utf8"))))
      .map(rel);

    expect(offenders).toEqual([]);
  });
});
