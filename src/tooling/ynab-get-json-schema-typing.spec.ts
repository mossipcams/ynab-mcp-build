import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ynabClientPaths = [
  "../platform/ynab/client.ts",
  "../platform/ynab/delta-client.ts",
].map((path) => fileURLToPath(new URL(path, import.meta.url)));

describe("YNAB JSON parser typing", () => {
  it("derives getJson return types from schemas", async () => {
    for (const path of ynabClientPaths) {
      const source = await readFile(path, "utf8");

      expect(source).not.toContain("async function getJson<T>(");
      expect(source).not.toContain("result.data as T");
      expect(source).not.toMatch(/await getJson<[^>]+>\(/u);
    }
  });
});
