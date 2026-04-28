import { describe, expect, it, vi } from "vitest";

import { getTransactionToolDefinitions } from "./tools.js";

describe("transaction tool descriptions", () => {
  it("steers broad browsing away from raw transaction lists and toward drilldowns", () => {
    const definitions = getTransactionToolDefinitions({
      listPlans: vi.fn(),
      listTransactions: vi.fn()
    } as never);

    expect(definitions.find((definition) => definition.name === "ynab_list_transactions")?.description).toContain(
      "Use only when"
    );
    expect(definitions.find((definition) => definition.name === "ynab_search_transactions")?.description).toContain(
      "drilldowns"
    );
    expect(definitions.find((definition) => definition.name === "ynab_get_transaction")?.description).toContain(
      "individual transaction"
    );
  });
});
