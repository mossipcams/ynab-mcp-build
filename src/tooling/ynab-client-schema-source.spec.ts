import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ynabClientPath = fileURLToPath(
  new URL("../platform/ynab/client.ts", import.meta.url),
);

describe("YNAB client schema source of truth", () => {
  it("derives response envelope types from Zod schemas", async () => {
    const source = await readFile(ynabClientPath, "utf8");

    expect(source).not.toMatch(/type Ynab[A-Za-z]+Response = \{\s*data:/u);
  });
});
