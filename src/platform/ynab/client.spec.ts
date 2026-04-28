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

  it("maps a full plan export from the single-plan endpoint", async () => {
    const requests: Array<string | URL | Request> = [];
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);

        return Response.json({
          data: {
            server_knowledge: 123,
            plan: {
              accounts: [
                {
                  balance: 120000,
                  cleared_balance: 100000,
                  closed: false,
                  deleted: false,
                  id: "account-1",
                  name: "Checking",
                  on_budget: true,
                  transfer_payee_id: "transfer-payee-1",
                  type: "checking",
                  uncleared_balance: 20000
                }
              ],
              category_groups: [
                {
                  deleted: false,
                  hidden: false,
                  id: "group-1",
                  name: "Everyday"
                }
              ],
              categories: [
                {
                  activity: -12000,
                  balance: 8000,
                  budgeted: 20000,
                  category_group_id: "group-1",
                  category_group_name: "Everyday",
                  deleted: false,
                  hidden: false,
                  id: "category-1",
                  name: "Groceries"
                }
              ],
              id: "plan-1",
              last_modified_on: "2026-04-28T12:00:00.000Z",
              months: [
                {
                  activity: -12000,
                  budgeted: 20000,
                  categories: [
                    {
                      activity: -12000,
                      balance: 8000,
                      budgeted: 20000,
                      category_group_id: "group-1",
                      category_group_name: "Everyday",
                      deleted: false,
                      hidden: false,
                      id: "category-1",
                      name: "Groceries"
                    }
                  ],
                  deleted: false,
                  income: 100000,
                  month: "2026-04-01",
                  to_be_budgeted: 5000
                }
              ],
              name: "Budget",
              payee_locations: [
                {
                  deleted: false,
                  id: "location-1",
                  latitude: "41.1",
                  longitude: "-87.2",
                  payee_id: "payee-1"
                }
              ],
              payees: [
                {
                  deleted: false,
                  id: "payee-1",
                  name: "Market",
                  transfer_account_id: null
                }
              ],
              scheduled_transactions: [
                {
                  account_id: "account-1",
                  account_name: "Checking",
                  amount: -45000,
                  category_id: "category-1",
                  category_name: "Rent",
                  date_first: "2026-04-01",
                  date_next: "2026-05-01",
                  deleted: false,
                  frequency: "monthly",
                  id: "scheduled-1",
                  payee_id: "payee-2",
                  payee_name: "Landlord",
                  subtransactions: []
                }
              ],
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
                  flag_color: "blue",
                  flag_name: "Business",
                  id: "txn-1",
                  payee_id: "payee-1",
                  payee_name: "Market",
                  subtransactions: [
                    {
                      amount: -12000,
                      category_id: "category-1",
                      deleted: false,
                      id: "subtxn-1",
                      transaction_id: "txn-1"
                    }
                  ],
                  transfer_account_id: null
                }
              ]
            }
          }
        });
      }
    });

    const result = await client.getPlanExport?.("plan-1");

    expect(requests.map(String)).toEqual(["https://api.ynab.com/v1/plans/plan-1"]);
    expect(result).toMatchObject({
      plan: {
        accounts: [
          {
            id: "account-1",
            onBudget: true,
            transferPayeeId: "transfer-payee-1"
          }
        ],
        categoryGroups: [
          {
            categories: [
              {
                id: "category-1"
              }
            ],
            id: "group-1"
          }
        ],
        months: [
          {
            categories: [
              {
                categoryGroupId: "group-1",
                id: "category-1"
              }
            ],
            month: "2026-04-01"
          }
        ],
        payeeLocations: [
          {
            latitude: "41.1",
            longitude: "-87.2"
          }
        ],
        scheduledTransactions: [
          {
            accountId: "account-1",
            frequency: "monthly",
            id: "scheduled-1"
          }
        ],
        transactions: [
          {
            flagColor: "blue",
            id: "txn-1",
            subtransactions: [
              {
                id: "subtxn-1"
              }
            ]
          }
        ]
      },
      serverKnowledge: 123
    });
  });

  it("lists money movements and movement groups from their dedicated endpoints", async () => {
    const requests: Array<string | URL | Request> = [];
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);

        if (String(input).endsWith("/money_movements")) {
          return Response.json({
            data: {
              server_knowledge: 456,
              money_movements: [
                {
                  amount: 25000,
                  amount_currency: 25,
                  amount_formatted: "$25.00",
                  from_category_id: "category-1",
                  id: "movement-1",
                  money_movement_group_id: "movement-group-1",
                  month: "2026-04-01",
                  moved_at: "2026-04-03T10:00:00Z",
                  note: "rebalance",
                  performed_by_user_id: "user-1",
                  to_category_id: "category-2"
                }
              ]
            }
          });
        }

        return Response.json({
          data: {
            server_knowledge: 789,
            money_movement_groups: [
              {
                group_created_at: "2026-04-03T10:00:00Z",
                id: "movement-group-1",
                month: "2026-04-01",
                note: "rebalance",
                performed_by_user_id: "user-1"
              }
            ]
          }
        });
      }
    });

    await expect(client.listMoneyMovements?.("plan-1")).resolves.toEqual({
      moneyMovements: [
        {
          amount: 25000,
          deleted: false,
          fromCategoryId: "category-1",
          id: "movement-1",
          moneyMovementGroupId: "movement-group-1",
          month: "2026-04-01",
          movedAt: "2026-04-03T10:00:00Z",
          note: "rebalance",
          performedByUserId: "user-1",
          toCategoryId: "category-2"
        }
      ],
      serverKnowledge: 456
    });
    await expect(client.listMoneyMovementGroups?.("plan-1")).resolves.toEqual({
      moneyMovementGroups: [
        {
          deleted: false,
          groupCreatedAt: "2026-04-03T10:00:00Z",
          id: "movement-group-1",
          month: "2026-04-01",
          note: "rebalance",
          performedByUserId: "user-1"
        }
      ],
      serverKnowledge: 789
    });
    expect(requests.map(String)).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/money_movements",
      "https://api.ynab.com/v1/plans/plan-1/money_movement_groups"
    ]);
  });
});
