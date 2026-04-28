import { describe, expect, it, vi } from "vitest";

import { getMoneyMovements } from "./service.js";

describe("money movement context optimization", () => {
  it("caps uncapped money movement lists at 65 rows", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      listAccounts: vi.fn().mockResolvedValue([
        { id: "account-1", name: "Checking", type: "checking", closed: false, deleted: false, balance: 0 },
        { id: "account-2", name: "Savings", type: "savings", closed: false, deleted: false, balance: 0 }
      ]),
      listTransactions: vi.fn().mockResolvedValue(
        Array.from({ length: 70 }, (_, index) => ({
          id: `txn-${index}`,
          date: `2026-04-${String(28 - Math.floor(index / 4)).padStart(2, "0")}`,
          amount: -1000,
          accountId: "account-1",
          accountName: "Checking",
          payeeName: "Transfer",
          deleted: false,
          transferAccountId: "account-2"
        }))
      )
    };

    await expect(getMoneyMovements(ynabClient as never, { planId: "plan-1" })).resolves.toMatchObject({
      movement_count: 70,
      limit: 65,
      offset: 0,
      returned_count: 65,
      has_more: true
    });
  });
});
