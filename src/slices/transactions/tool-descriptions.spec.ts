import { describe, expect, it, vi } from "vitest";

import { getTransactionToolDefinitions } from "./tools.js";

describe("transaction tool descriptions", () => {
  it("keeps the direct transaction slice focused on exact drilldown detail", () => {
    const definitions = getTransactionToolDefinitions({
      listPlans: vi.fn(),
      listTransactions: vi.fn(),
    } as never);

    expect(definitions).toHaveLength(1);
    expect(
      definitions.find(
        (definition) => definition.name === "ynab_get_transaction",
      )?.description,
    ).toContain("individual transaction");
  });
});
