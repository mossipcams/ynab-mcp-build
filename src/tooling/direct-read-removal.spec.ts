import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readFile = (path: string) => readFileSync(path, "utf8");
const legacyReadPathTerm = ["li", "ve"].join("");

describe("direct-read removal contract", () => {
  it("does not expose app dependency hooks that can bypass the D1 read model", () => {
    const source = readFile("src/app/dependencies.ts");

    expect(source).not.toContain("resolveYnabClient");
    expect(source).not.toContain("ynabClient?:");
    expect(source).not.toContain("createYnabClient");
  });

  it("does not keep a scheduled-sync branch for non-D1 read sources", () => {
    const source = readFile("src/app/scheduled-sync.ts");

    expect(source).not.toContain("ynabReadSource !==");
    expect(source).not.toContain("YNAB_READ_SOURCE is not d1");
  });

  it("does not keep legacy money movement slice files", () => {
    expect(existsSync("src/slices/money-movements")).toBe(false);
  });

  it("does not document direct API read behavior as an active mode", () => {
    const documentation = [
      readFile("README.md"),
      readFile("architecture.md"),
    ].join("\n");

    expect(documentation).not.toContain(`${legacyReadPathTerm} YNAB`);
    expect(documentation).not.toContain(`${legacyReadPathTerm} YNAB reads`);
    expect(documentation).not.toContain(
      `existing ${legacyReadPathTerm} YNAB slices`,
    );
    expect(documentation).not.toContain(`${legacyReadPathTerm} mode`);
  });
});
