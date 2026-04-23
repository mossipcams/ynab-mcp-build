import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const workerEntrypoint = readFileSync(join(sourceDirectory, "index.ts"), "utf8");

describe("worker entrypoint exports", () => {
  it("keeps the legacy oauth durable object export available for deploy compatibility", () => {
    // DEFECT: deploys can fail against an existing worker when a previously deployed durable object class disappears from the module exports.
    expect(workerEntrypoint).toContain("export { McpSessionDO, OAuthStateDO };");
  });
});
