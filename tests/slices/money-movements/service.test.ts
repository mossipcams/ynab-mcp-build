import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  getMoneyMovementGroups,
  getMoneyMovements
} from "../../../src/slices/money-movements/service.js";
import { getMoneyMovementToolDefinitions } from "../../../src/slices/money-movements/tools.js";

describe("money movements service", () => {
  it("returns only outgoing transfer movements with resolved destination account names", async () => {
    // DEFECT: money movement listings can double-count transfers or include non-transfer spending when deriving movement rows.
    const ynabClient = {
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          deleted: false
        },
        {
          id: "account-2",
          name: "Savings",
          deleted: false
        }
      ]),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-transfer-out",
          date: "2026-04-12",
          amount: -5000,
          accountId: "account-1",
          accountName: "Checking",
          transferAccountId: "account-2",
          payeeName: "Transfer to Savings",
          deleted: false
        },
        {
          id: "txn-transfer-in",
          date: "2026-04-12",
          amount: 5000,
          accountId: "account-2",
          accountName: "Savings",
          transferAccountId: "account-1",
          payeeName: "Transfer from Checking",
          deleted: false
        },
        {
          id: "txn-spend",
          date: "2026-04-11",
          amount: -2500,
          accountId: "account-1",
          accountName: "Checking",
          transferAccountId: null,
          payeeName: "Grocer",
          deleted: false
        }
      ]),
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      })
    };

    await expect(getMoneyMovements(ynabClient as never, {})).resolves.toEqual({
      money_movements: [
        {
          id: "txn-transfer-out",
          date: "2026-04-12",
          amount: "5.00",
          from_account_id: "account-1",
          from_account_name: "Checking",
          to_account_id: "account-2",
          to_account_name: "Savings",
          payee_name: "Transfer to Savings"
        }
      ],
      movement_count: 1
    });
  });

  it("groups movements by account pair and sums total transferred amount", async () => {
    // DEFECT: grouped money movement totals can undercount or split a single transfer lane across multiple buckets.
    const ynabClient = {
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          deleted: false
        },
        {
          id: "account-2",
          name: "Savings",
          deleted: false
        }
      ]),
      listTransactions: vi.fn().mockResolvedValue([
        {
          id: "txn-1",
          date: "2026-04-12",
          amount: -5000,
          accountId: "account-1",
          accountName: "Checking",
          transferAccountId: "account-2",
          payeeName: "Transfer",
          deleted: false
        },
        {
          id: "txn-2",
          date: "2026-04-10",
          amount: -7000,
          accountId: "account-1",
          accountName: "Checking",
          transferAccountId: "account-2",
          payeeName: "Transfer",
          deleted: false
        }
      ]),
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      })
    };

    await expect(getMoneyMovementGroups(ynabClient as never, {})).resolves.toEqual({
      money_movement_groups: [
        {
          id: "account-1:account-2",
          from_account_id: "account-1",
          from_account_name: "Checking",
          to_account_id: "account-2",
          to_account_name: "Savings",
          total_amount: "12.00",
          movement_count: 2,
          latest_date: "2026-04-12"
        }
      ],
      group_count: 1
    });
  });

  it("requires month in the month-scoped money movement tool schema", () => {
    // DEFECT: month-scoped money movement tools can stop requiring the month selector and accept ambiguous period requests.
    const ynabClient = {
      listAccounts: vi.fn(),
      listTransactions: vi.fn(),
      listPlans: vi.fn()
    };
    const definitions = getMoneyMovementToolDefinitions(ynabClient as never);
    const monthlyTool = definitions.find(
      (definition) => definition.name === "ynab_get_money_movements_by_month"
    );

    expect(monthlyTool).toBeDefined();
    expect(() => z.object(monthlyTool?.inputSchema ?? {}).parse({})).toThrow();
  });
});
