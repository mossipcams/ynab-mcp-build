import { describe, expect, it } from "vitest";

import { createYnabClient } from "./client.js";

function transactionResponse() {
  return {
    data: {
      transactions: [
        {
          account_id: "account-1",
          account_name: "Checking",
          amount: -12000,
          approved: true,
          category_id: "category-1",
          category_name: "Groceries",
          cleared: "cleared",
          date: "2026-04-12",
          deleted: false,
          id: "txn-1",
          payee_id: "payee-1",
          payee_name: "Market",
          transfer_account_id: null
        }
      ]
    }
  };
}

describe("ynab scoped transaction client methods", () => {
  it("uses scoped transaction endpoints for account, category, and payee drilldowns", async () => {
    const requests: Array<string | URL | Request> = [];
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);

        return Response.json(transactionResponse());
      }
    });

    await client.listTransactionsByAccount("plan-1", "account-1");
    await client.listTransactionsByCategory("plan-1", "category-1");
    await client.listTransactionsByPayee("plan-1", "payee-1");

    expect(requests.map(String)).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/accounts/account-1/transactions",
      "https://api.ynab.com/v1/plans/plan-1/categories/category-1/transactions",
      "https://api.ynab.com/v1/plans/plan-1/payees/payee-1/transactions"
    ]);
  });
});

describe("ynab money movement client methods", () => {
  it("uses money movement endpoints and maps server knowledge", async () => {
    const requests: Array<string | URL | Request> = [];
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);

        if (String(input).endsWith("/money_movement_groups")) {
          return Response.json({
            data: {
              money_movement_groups: [
                {
                  group_created_at: "2026-04-28T12:00:00.000Z",
                  id: "group-1",
                  month: "2026-04-01",
                  note: "rebalance",
                  performed_by_user_id: "user-1"
                }
              ],
              server_knowledge: 45
            }
          });
        }

        return Response.json({
          data: {
            money_movements: [
              {
                amount: 12000,
                from_category_id: "category-1",
                id: "movement-1",
                money_movement_group_id: "group-1",
                month: "2026-04-01",
                moved_at: "2026-04-28T12:01:00.000Z",
                to_category_id: "category-2"
              }
            ],
            server_knowledge: 46
          }
        });
      }
    });

    await expect(client.listMoneyMovements("plan-1")).resolves.toMatchObject({
      moneyMovements: [
        {
          amount: 12000,
          fromCategoryId: "category-1",
          id: "movement-1",
          moneyMovementGroupId: "group-1",
          toCategoryId: "category-2"
        }
      ],
      serverKnowledge: 46
    });
    await expect(client.listMoneyMovementGroups("plan-1")).resolves.toMatchObject({
      moneyMovementGroups: [
        {
          groupCreatedAt: "2026-04-28T12:00:00.000Z",
          id: "group-1",
          month: "2026-04-01",
          note: "rebalance"
        }
      ],
      serverKnowledge: 45
    });
    expect(requests.map(String)).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/money_movements",
      "https://api.ynab.com/v1/plans/plan-1/money_movement_groups"
    ]);
  });
});
