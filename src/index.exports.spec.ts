import { describe, expect, it } from "vitest";
import workerEntrypoint from "./index.ts?raw";

describe("worker entrypoint exports", () => {
  it("keeps the legacy oauth durable object export available for deploy compatibility", () => {
    // DEFECT: deploys can fail against an existing worker when a previously deployed durable object class disappears from the module exports.
    expect(workerEntrypoint).toContain("export { McpSessionDO, OAuthStateDO };");
  });
});
