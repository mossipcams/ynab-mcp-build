import { describe, expect, it, vi } from "vitest";

import { listAccounts } from "./service.js";

describe("account context optimization", () => {
  it("caps uncapped account lists at 65 rows", async () => {
    const ynabClient = {
      listPlans: vi.fn(),
      listAccounts: vi.fn().mockResolvedValue(
        Array.from({ length: 70 }, (_, index) => ({
          id: `account-${index}`,
          name: `Account ${index}`,
          type: "checking",
          closed: false,
          deleted: false,
          balance: index * 1000,
        })),
      ),
    };

    await expect(
      listAccounts(ynabClient as never, { planId: "plan-1" }),
    ).resolves.toMatchObject({
      account_count: 70,
      limit: 65,
      offset: 0,
      returned_count: 65,
      has_more: true,
    });
  });
});
