import { describe, expect, it } from "vitest";

import type { YnabClient } from "../../platform/ynab/client.js";
import {
  getCashResilienceSummary,
  getNetWorthTrajectory,
  getUpcomingObligations,
} from "./service.js";

describe("financial health service", () => {
  it("excludes deleted and closed accounts from trajectory debt", async () => {
    const ynabClient = {
      listAccounts: async () => [
        {
          id: "cash",
          name: "Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 200000,
        },
        {
          id: "card-active",
          name: "Active Card",
          type: "creditCard",
          closed: false,
          deleted: false,
          balance: -100000,
        },
        {
          id: "card-deleted",
          name: "Deleted Card",
          type: "creditCard",
          closed: false,
          deleted: true,
          balance: -900000,
        },
        {
          id: "card-closed",
          name: "Closed Card",
          type: "creditCard",
          closed: true,
          deleted: false,
          balance: -800000,
        },
      ],
      listTransactions: async () => [],
    } as unknown as YnabClient;

    await expect(
      getNetWorthTrajectory(ynabClient, {
        fromMonth: "2026-04-01",
        planId: "plan-1",
        toMonth: "2026-04-01",
      }),
    ).resolves.toMatchObject({
      months: [
        {
          debt: "100.00",
          liquid_cash: "200.00",
          net_worth: "100.00",
        },
      ],
    });
  });

  it("excludes scheduled transfers from obligations and cash pressure", async () => {
    const scheduledTransactions = [
      {
        id: "transfer-1",
        dateFirst: "2026-04-01",
        dateNext: "2026-04-10",
        amount: -10000,
        transferAccountId: "savings",
        deleted: false,
      },
      {
        id: "rent",
        dateFirst: "2026-04-01",
        dateNext: "2026-04-10",
        amount: -20000,
        payeeName: "Rent",
        deleted: false,
      },
      {
        id: "paycheck",
        dateFirst: "2026-04-01",
        dateNext: "2026-04-15",
        amount: 5000,
        payeeName: "Payroll",
        deleted: false,
      },
    ];
    const ynabClient = {
      listAccounts: async () => [
        {
          id: "cash",
          name: "Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 90000,
        },
      ],
      listPlanMonths: async () => [
        { month: "2026-02-01", deleted: false, activity: -30000 },
        { month: "2026-03-01", deleted: false, activity: -30000 },
        { month: "2026-04-01", deleted: false, activity: -30000 },
      ],
      listScheduledTransactions: async () => scheduledTransactions,
    } as unknown as YnabClient;

    await expect(
      getUpcomingObligations(ynabClient, {
        asOfDate: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      obligation_count: 1,
      expected_inflow_count: 1,
      windows: {
        "30d": {
          total_inflows: "5.00",
          total_outflows: "20.00",
          net_upcoming: "-15.00",
        },
      },
      top_due: [
        expect.objectContaining({
          id: "rent",
        }),
        expect.objectContaining({
          id: "paycheck",
        }),
      ],
    });

    await expect(
      getCashResilienceSummary(ynabClient, {
        month: "2026-04-01",
        planId: "plan-1",
      }),
    ).resolves.toMatchObject({
      average_daily_outflow: "1.00",
      average_monthly_spending: "30.00",
      coverage_months: "3.00",
      runway_days: "90.00",
      scheduled_net_next_30d: "-15.00",
    });
  });
});
