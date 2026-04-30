import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const syncServicePath = fileURLToPath(
  new URL(
    "../platform/ynab/read-model/read-model-sync-service.ts",
    import.meta.url,
  ),
);

describe("read-model sync endpoint typing", () => {
  it("preserves endpoint record types through fetch and write", async () => {
    const source = await readFile(syncServicePath, "utf8");

    expect(source).not.toContain("EndpointConfig<unknown>");
    expect(source).not.toMatch(/records as Ynab/u);
    expect(source).not.toContain("records: unknown[]");
  });
});
