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
          transfer_account_id: null,
        },
      ],
    },
  };
}

describe("ynab scoped transaction client methods", () => {
  it("rejects malformed YNAB response envelopes at the external boundary", async () => {
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        Response.json({
          data: {
            transactions: [
              {
                id: "txn-1",
              },
            ],
          },
        }),
    });

    await expect(client.listTransactions("plan-1")).rejects.toThrow(
      "YNAB API response did not match expected schema.",
    );
  });

  it("uses scoped transaction endpoints for account, category, and payee drilldowns", async () => {
    const requests: Array<string | URL | Request> = [];
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(input);

        return Response.json(transactionResponse());
      },
    });

    await client.listTransactionsByAccount("plan-1", "account-1");
    await client.listTransactionsByCategory("plan-1", "category-1");
    await client.listTransactionsByPayee("plan-1", "payee-1");

    expect(requests.map(String)).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/accounts/account-1/transactions",
      "https://api.ynab.com/v1/plans/plan-1/categories/category-1/transactions",
      "https://api.ynab.com/v1/plans/plan-1/payees/payee-1/transactions",
    ]);
  });
});

describe("ynab plans client methods", () => {
  it("accepts plan discovery responses with no default plan", async () => {
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        Response.json({
          data: {
            default_plan: null,
            plans: [{ id: "plan-1", name: "Household" }],
          },
        }),
    });

    await expect(client.listPlans()).resolves.toEqual({
      defaultPlan: null,
      plans: [{ id: "plan-1", name: "Household" }],
    });
  });
});

describe("ynab category client methods", () => {
  it("accepts ordinary no-goal categories with null goal fields", async () => {
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () =>
        Response.json({
          data: {
            category: {
              id: "category-1",
              name: "Groceries",
              hidden: false,
              deleted: false,
              balance: 12000,
              goal_type: null,
              goal_target: null,
            },
          },
        }),
    });

    await expect(
      client.getCategory("plan-1", "category-1"),
    ).resolves.toMatchObject({
      id: "category-1",
      name: "Groceries",
    });
    await expect(
      client.getMonthCategory("plan-1", "2026-04-01", "category-1"),
    ).resolves.toMatchObject({
      id: "category-1",
      name: "Groceries",
    });
  });
});

describe("ynab client endpoint contracts", () => {
  it("uses encoded /plans endpoints for the plan-scoped client surface", async () => {
    const requests: Array<{
      input: string | URL | Request;
      init?: RequestInit;
    }> = [];
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1/",
      fetchFn: async (input, init) => {
        requests.push(init ? { input, init } : { input });
        const url = String(input);

        if (url.endsWith("/plans/plan%201")) {
          return Response.json({
            data: {
              plan: {
                id: "plan-1",
                name: "Plan",
                accounts: [{ id: "account-1" }],
                category_groups: [{ id: "group-1" }],
                payees: [{ id: "payee-1" }],
              },
            },
          });
        }

        if (url.endsWith("/categories")) {
          return Response.json({
            data: {
              category_groups: [
                {
                  categories: [
                    {
                      deleted: false,
                      hidden: false,
                      id: "category-1",
                      name: "Groceries",
                    },
                  ],
                  deleted: false,
                  hidden: false,
                  id: "group-1",
                  name: "Everyday",
                },
              ],
            },
          });
        }

        if (url.includes("/categories/category%201")) {
          return Response.json({
            data: {
              category: {
                balance: 12000,
                hidden: false,
                id: "category-1",
                name: "Groceries",
              },
            },
          });
        }

        if (url.endsWith("/settings")) {
          return Response.json({
            data: {
              settings: {
                currency_format: {
                  iso_code: "USD",
                  decimal_digits: 2,
                },
                date_format: {
                  format: "MM/DD/YYYY",
                },
              },
            },
          });
        }

        if (url.endsWith("/months")) {
          return Response.json({
            data: {
              months: [
                {
                  activity: -12000,
                  budgeted: 50000,
                  income: 100000,
                  month: "2026-04-01",
                },
              ],
            },
          });
        }

        if (url.includes("/months/2026-04-01")) {
          return Response.json({
            data: {
              month: {
                age_of_money: 12,
                categories: [
                  {
                    balance: 12000,
                    hidden: false,
                    id: "category-1",
                    name: "Groceries",
                  },
                ],
                month: "2026-04-01",
              },
            },
          });
        }

        if (url.includes("/accounts/account%201")) {
          return Response.json({
            data: {
              account: {
                balance: 12000,
                closed: false,
                id: "account-1",
                name: "Checking",
                type: "checking",
              },
            },
          });
        }

        if (url.endsWith("/transactions?since_date=2026-04-01")) {
          return Response.json(transactionResponse());
        }

        if (url.includes("/transactions/txn%201")) {
          return Response.json({
            data: {
              transaction: transactionResponse().data.transactions[0],
            },
          });
        }

        if (url.includes("/scheduled_transactions/scheduled%201")) {
          return Response.json({
            data: {
              scheduled_transaction: {
                amount: -45000,
                date_first: "2026-04-01",
                id: "scheduled-1",
              },
            },
          });
        }

        if (url.endsWith("/scheduled_transactions")) {
          return Response.json({
            data: {
              scheduled_transactions: [
                {
                  amount: -45000,
                  date_first: "2026-04-01",
                  id: "scheduled-1",
                },
              ],
            },
          });
        }

        if (url.includes("/payees/payee%201/payee_locations")) {
          return Response.json({
            data: {
              payee_locations: [
                {
                  id: "location-1",
                  payee_id: "payee-1",
                },
              ],
            },
          });
        }

        if (url.includes("/payees/payee%201")) {
          return Response.json({
            data: {
              payee: {
                id: "payee-1",
                name: "Market",
              },
            },
          });
        }

        if (url.endsWith("/payees")) {
          return Response.json({
            data: {
              payees: [
                {
                  id: "payee-1",
                  name: "Market",
                },
              ],
            },
          });
        }

        if (url.includes("/payee_locations/location%201")) {
          return Response.json({
            data: {
              payee_location: {
                id: "location-1",
                payee_id: "payee-1",
              },
            },
          });
        }

        if (url.endsWith("/payee_locations")) {
          return Response.json({
            data: {
              payee_locations: [
                {
                  id: "location-1",
                  payee_id: "payee-1",
                },
              ],
            },
          });
        }

        throw new Error(`Unexpected URL ${url}`);
      },
    });

    await expect(client.getPlan("plan 1")).resolves.toMatchObject({
      accountCount: 1,
      categoryGroupCount: 1,
      payeeCount: 1,
    });
    await expect(client.listCategories("plan 1")).resolves.toHaveLength(1);
    await expect(
      client.getCategory("plan 1", "category 1"),
    ).resolves.toMatchObject({
      balance: 12000,
    });
    await expect(
      client.getMonthCategory("plan 1", "2026-04-01", "category 1"),
    ).resolves.toMatchObject({
      balance: 12000,
    });
    await expect(client.getPlanSettings("plan 1")).resolves.toMatchObject({
      currencyFormat: {
        isoCode: "USD",
      },
      dateFormat: {
        format: "MM/DD/YYYY",
      },
    });
    await expect(client.listPlanMonths("plan 1")).resolves.toMatchObject([
      {
        month: "2026-04-01",
      },
    ]);
    await expect(
      client.getPlanMonth("plan 1", "2026-04-01"),
    ).resolves.toMatchObject({
      ageOfMoney: 12,
      categoryCount: 1,
    });
    await expect(
      client.getAccount("plan 1", "account 1"),
    ).resolves.toMatchObject({
      balance: 12000,
    });
    await expect(
      client.listTransactions("plan 1", "2026-04-01"),
    ).resolves.toHaveLength(1);
    await expect(
      client.getTransaction("plan 1", "txn 1"),
    ).resolves.toMatchObject({
      id: "txn-1",
    });
    await expect(
      client.listScheduledTransactions("plan 1"),
    ).resolves.toHaveLength(1);
    await expect(
      client.getScheduledTransaction("plan 1", "scheduled 1"),
    ).resolves.toMatchObject({
      id: "scheduled-1",
    });
    await expect(client.listPayees("plan 1")).resolves.toHaveLength(1);
    await expect(client.getPayee("plan 1", "payee 1")).resolves.toMatchObject({
      id: "payee-1",
    });
    await expect(client.listPayeeLocations("plan 1")).resolves.toHaveLength(1);
    await expect(
      client.getPayeeLocation("plan 1", "location 1"),
    ).resolves.toMatchObject({
      id: "location-1",
    });
    await expect(
      client.getPayeeLocationsByPayee("plan 1", "payee 1"),
    ).resolves.toHaveLength(1);

    expect(requests.map(({ input }) => String(input))).toEqual([
      "https://api.ynab.com/v1/plans/plan%201",
      "https://api.ynab.com/v1/plans/plan%201/categories",
      "https://api.ynab.com/v1/plans/plan%201/categories/category%201",
      "https://api.ynab.com/v1/plans/plan%201/months/2026-04-01/categories/category%201",
      "https://api.ynab.com/v1/plans/plan%201/settings",
      "https://api.ynab.com/v1/plans/plan%201/months",
      "https://api.ynab.com/v1/plans/plan%201/months/2026-04-01",
      "https://api.ynab.com/v1/plans/plan%201/accounts/account%201",
      "https://api.ynab.com/v1/plans/plan%201/transactions?since_date=2026-04-01",
      "https://api.ynab.com/v1/plans/plan%201/transactions/txn%201",
      "https://api.ynab.com/v1/plans/plan%201/scheduled_transactions",
      "https://api.ynab.com/v1/plans/plan%201/scheduled_transactions/scheduled%201",
      "https://api.ynab.com/v1/plans/plan%201/payees",
      "https://api.ynab.com/v1/plans/plan%201/payees/payee%201",
      "https://api.ynab.com/v1/plans/plan%201/payee_locations",
      "https://api.ynab.com/v1/plans/plan%201/payee_locations/location%201",
      "https://api.ynab.com/v1/plans/plan%201/payees/payee%201/payee_locations",
    ]);
    expect(
      requests.every(
        ({ init }) =>
          (init?.headers as Record<string, string> | undefined)
            ?.Authorization === "Bearer pat-secret",
      ),
    ).toBe(true);
  });

  it("maps fetch failures into retryable upstream errors", async () => {
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async () => {
        throw new Error("network down");
      },
    });

    await expect(client.getUser()).rejects.toMatchObject({
      category: "upstream",
      retryable: true,
    });
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
                  performed_by_user_id: "user-1",
                },
              ],
              server_knowledge: 45,
            },
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
                to_category_id: "category-2",
              },
            ],
            server_knowledge: 46,
          },
        });
      },
    });

    await expect(client.listMoneyMovements("plan-1")).resolves.toMatchObject({
      moneyMovements: [
        {
          amount: 12000,
          fromCategoryId: "category-1",
          id: "movement-1",
          moneyMovementGroupId: "group-1",
          toCategoryId: "category-2",
        },
      ],
      serverKnowledge: 46,
    });
    await expect(
      client.listMoneyMovementGroups("plan-1"),
    ).resolves.toMatchObject({
      moneyMovementGroups: [
        {
          groupCreatedAt: "2026-04-28T12:00:00.000Z",
          id: "group-1",
          month: "2026-04-01",
          note: "rebalance",
        },
      ],
      serverKnowledge: 45,
    });
    expect(requests.map(String)).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/money_movements",
      "https://api.ynab.com/v1/plans/plan-1/money_movement_groups",
    ]);
  });

  it("sends last_knowledge_of_server for money movement requests when provided", async () => {
    // DEFECT: YNAB money movement client can drop delta cursor query params.
    const requests: string[] = [];
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(String(input));

        if (String(input).includes("money_movement_groups")) {
          return Response.json({
            data: { money_movement_groups: [], server_knowledge: 43 },
          });
        }

        return Response.json({
          data: { money_movements: [], server_knowledge: 42 },
        });
      },
    });

    await client.listMoneyMovements("plan-1", 41);
    await client.listMoneyMovementGroups("plan-1", 41);

    expect(requests).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/money_movements?last_knowledge_of_server=41",
      "https://api.ynab.com/v1/plans/plan-1/money_movement_groups?last_knowledge_of_server=41",
    ]);
  });

  it("omits money movement cursor query params when no server knowledge exists", async () => {
    // DEFECT: initial money movement sync can send invalid empty cursor parameters.
    const requests: string[] = [];
    const client = createYnabClient({
      accessToken: "pat-secret",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn: async (input) => {
        requests.push(String(input));

        return Response.json({
          data: String(input).includes("money_movement_groups")
            ? { money_movement_groups: [], server_knowledge: 43 }
            : { money_movements: [], server_knowledge: 42 },
        });
      },
    });

    await client.listMoneyMovements("plan-1");
    await client.listMoneyMovementGroups("plan-1");

    expect(requests).toEqual([
      "https://api.ynab.com/v1/plans/plan-1/money_movements",
      "https://api.ynab.com/v1/plans/plan-1/money_movement_groups",
    ]);
  });
});
