import { describe, expect, it, vi } from "vitest";

import { createYnabClient } from "./client.js";

describe("YNAB client", () => {
  it("maps the user endpoint into a runtime-safe user shape", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            user: {
              id: "user-1",
              name: "Casey Budgeter"
            }
          }
        })
      )
    );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    const user = await client.getUser();

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.ynab.com/v1/user",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer token-123"
        }
      })
    );
    expect(user).toMatchObject({
      id: "user-1",
      name: "Casey Budgeter"
    });
  });

  it("maps plan endpoints into runtime-safe plan shapes", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              plans: [
                {
                  id: "plan-1",
                  name: "Household",
                  last_modified_on: "2026-04-01T00:00:00Z"
                }
              ],
              default_plan: {
                id: "plan-1",
                name: "Household"
              }
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              plan: {
                id: "plan-1",
                name: "Household",
                last_modified_on: "2026-04-01T00:00:00Z",
                first_month: "2026-01-01",
                last_month: "2026-12-01",
                accounts: [{ id: "a-1" }, { id: "a-2" }],
                category_groups: [{ id: "cg-1" }],
                payees: [{ id: "p-1" }, { id: "p-2" }, { id: "p-3" }]
              }
            }
          })
        )
      );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    const plans = await client.listPlans();
    const plan = await client.getPlan("plan-1");

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://api.ynab.com/v1/budgets",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer token-123"
        }
      })
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.ynab.com/v1/budgets/plan-1",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer token-123"
        }
      })
    );
    expect(plans).toMatchObject({
      plans: [
        {
          id: "plan-1",
          name: "Household",
          lastModifiedOn: "2026-04-01T00:00:00Z"
        }
      ],
      defaultPlan: {
        id: "plan-1",
        name: "Household"
      }
    });
    expect(plan).toMatchObject({
      id: "plan-1",
      name: "Household",
      firstMonth: "2026-01-01",
      lastMonth: "2026-12-01",
      accountCount: 2,
      categoryGroupCount: 1,
      payeeCount: 3
    });
  });

  it("surfaces YNAB API error details when a request fails", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            detail: "The access token provided is invalid."
          }
        }),
        {
          status: 401,
          statusText: "Unauthorized"
        }
      )
    );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    await expect(client.listPlans()).rejects.toThrow(
      "YNAB API request failed with 401: The access token provided is invalid."
    );
  });

  it("maps account endpoints into runtime-safe account shapes", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              accounts: [
                {
                  id: "account-1",
                  name: "Checking",
                  type: "checking",
                  closed: false,
                  deleted: false,
                  balance: 123450
                }
              ]
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              account: {
                id: "account-1",
                name: "Checking",
                type: "checking",
                on_budget: true,
                closed: false,
                balance: 123450
              }
            }
          })
        )
      );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1/",
      fetchFn
    });

    const accounts = await client.listAccounts("plan-1");
    const account = await client.getAccount("plan-1", "account-1");

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://api.ynab.com/v1/budgets/plan-1/accounts",
      expect.any(Object)
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.ynab.com/v1/budgets/plan-1/accounts/account-1",
      expect.any(Object)
    );
    expect(accounts).toMatchObject([
      {
        id: "account-1",
        name: "Checking",
        type: "checking",
        closed: false,
        deleted: false,
        balance: 123450
      }
    ]);
    expect(account).toMatchObject({
      id: "account-1",
      name: "Checking",
      type: "checking",
      onBudget: true,
      closed: false,
      balance: 123450
    });
  });

  it("maps category list endpoints into runtime-safe category group shapes", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            category_groups: [
              {
                id: "group-1",
                name: "Bills",
                hidden: false,
                deleted: false,
                categories: [
                  {
                    id: "category-1",
                    name: "Rent",
                    hidden: false,
                    deleted: false,
                    category_group_name: "Bills"
                  },
                  {
                    id: "category-2",
                    name: "Archived",
                    hidden: true,
                    deleted: false,
                    category_group_name: "Bills"
                  }
                ]
              },
              {
                id: "group-2",
                name: "Hidden Group",
                hidden: true,
                deleted: false,
                categories: []
              }
            ]
          }
        })
      )
    );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    const categoryGroups = await client.listCategories("plan-1");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.ynab.com/v1/budgets/plan-1/categories",
      expect.any(Object)
    );
    expect(categoryGroups).toMatchObject([
      {
        id: "group-1",
        name: "Bills",
        hidden: false,
        deleted: false,
        categories: [
          {
            id: "category-1",
            name: "Rent",
            hidden: false,
            deleted: false,
            categoryGroupName: "Bills"
          },
          {
            id: "category-2",
            name: "Archived",
            hidden: true,
            deleted: false,
            categoryGroupName: "Bills"
          }
        ]
      },
      {
        id: "group-2",
        name: "Hidden Group",
        hidden: true,
        deleted: false,
        categories: []
      }
    ]);
  });

  it("maps category detail endpoints into runtime-safe category shapes", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              category: {
                id: "category-1",
                name: "Rent",
                hidden: false,
                category_group_name: "Bills",
                balance: 500000,
                goal_type: "MF",
                goal_target: 750000
              }
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              category: {
                id: "category-1",
                name: "Rent",
                hidden: false,
                category_group_name: "Bills",
                budgeted: 200000,
                activity: -150000,
                balance: 550000,
                goal_type: "MF",
                goal_target: 750000,
                goal_under_funded: 50000
              }
            }
          })
        )
      );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    const category = await client.getCategory("plan-1", "category-1");
    const monthCategory = await client.getMonthCategory("plan-1", "2026-04-01", "category-1");

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://api.ynab.com/v1/budgets/plan-1/categories/category-1",
      expect.any(Object)
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.ynab.com/v1/budgets/plan-1/months/2026-04-01/categories/category-1",
      expect.any(Object)
    );
    expect(category).toMatchObject({
      id: "category-1",
      name: "Rent",
      hidden: false,
      categoryGroupName: "Bills",
      balance: 500000,
      goalType: "MF",
      goalTarget: 750000
    });
    expect(monthCategory).toMatchObject({
      id: "category-1",
      name: "Rent",
      hidden: false,
      categoryGroupName: "Bills",
      budgeted: 200000,
      activity: -150000,
      balance: 550000,
      goalType: "MF",
      goalTarget: 750000,
      goalUnderFunded: 50000
    });
  });

  it("maps plan settings endpoints into runtime-safe plan settings", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            settings: {
              date_format: {
                format: "MM/DD/YYYY"
              },
              currency_format: {
                iso_code: "USD",
                example_format: "$12,345.67",
                decimal_digits: 2,
                decimal_separator: ".",
                symbol_first: true,
                group_separator: ",",
                currency_symbol: "$",
                display_symbol: true
              }
            }
          }
        })
      )
    );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    const settings = await client.getPlanSettings("plan-1");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.ynab.com/v1/budgets/plan-1/settings",
      expect.any(Object)
    );
    expect(settings).toMatchObject({
      dateFormat: {
        format: "MM/DD/YYYY"
      },
      currencyFormat: {
        isoCode: "USD",
        exampleFormat: "$12,345.67",
        decimalDigits: 2,
        decimalSeparator: ".",
        symbolFirst: true,
        groupSeparator: ",",
        currencySymbol: "$",
        displaySymbol: true
      }
    });
  });

  it("maps plan month endpoints into runtime-safe month shapes", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              months: [
                {
                  month: "2026-03-01",
                  income: 300000,
                  budgeted: 250000,
                  activity: -200000,
                  to_be_budgeted: 50000,
                  deleted: false
                },
                {
                  month: "2026-02-01",
                  income: 250000,
                  budgeted: 200000,
                  activity: -180000,
                  to_be_budgeted: 20000,
                  deleted: true
                }
              ]
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              month: {
                month: "2026-03-01",
                income: 300000,
                budgeted: 250000,
                activity: -200000,
                to_be_budgeted: 50000,
                age_of_money: 27,
                categories: [
                  {
                    id: "category-1",
                    name: "Rent",
                    budgeted: 120000,
                    activity: -120000,
                    balance: 100000,
                    deleted: false,
                    hidden: false,
                    goal_under_funded: 0,
                    category_group_name: "Bills"
                  },
                  {
                    id: "category-2",
                    name: "Groceries",
                    budgeted: 45000,
                    activity: -70000,
                    balance: -25000,
                    deleted: false,
                    hidden: false,
                    goal_under_funded: 15000,
                    category_group_name: "Food"
                  }
                ]
              }
            }
          })
        )
      );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    const months = await client.listPlanMonths("plan-1");
    const month = await client.getPlanMonth("plan-1", "2026-03-01");

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://api.ynab.com/v1/budgets/plan-1/months",
      expect.any(Object)
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.ynab.com/v1/budgets/plan-1/months/2026-03-01",
      expect.any(Object)
    );
    expect(months).toMatchObject([
      {
        month: "2026-03-01",
        income: 300000,
        budgeted: 250000,
        activity: -200000,
        toBeBudgeted: 50000,
        deleted: false
      },
      {
        month: "2026-02-01",
        income: 250000,
        budgeted: 200000,
        activity: -180000,
        toBeBudgeted: 20000,
        deleted: true
      }
    ]);
    expect(month).toMatchObject({
      month: "2026-03-01",
      income: 300000,
      budgeted: 250000,
      activity: -200000,
      toBeBudgeted: 50000,
      ageOfMoney: 27,
      categoryCount: 2,
      categories: [
        {
          id: "category-1",
          name: "Rent",
          budgeted: 120000,
          activity: -120000,
          balance: 100000,
          deleted: false,
          hidden: false,
          goalUnderFunded: 0,
          categoryGroupName: "Bills"
        },
        {
          id: "category-2",
          name: "Groceries",
          budgeted: 45000,
          activity: -70000,
          balance: -25000,
          deleted: false,
          hidden: false,
          goalUnderFunded: 15000,
          categoryGroupName: "Food"
        }
      ]
    });
  });

  it("maps transaction endpoints into runtime-safe transaction shapes", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              transactions: [
                {
                  id: "transaction-1",
                  date: "2026-03-15",
                  amount: -123450,
                  payee_id: "payee-1",
                  payee_name: "Groceries",
                  category_id: "category-1",
                  category_name: "Food",
                  account_id: "account-1",
                  account_name: "Checking",
                  approved: true,
                  cleared: "cleared",
                  deleted: false,
                  transfer_account_id: null
                }
              ]
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              transaction: {
                id: "transaction-1",
                date: "2026-03-15",
                amount: -123450,
                payee_id: "payee-1",
                payee_name: "Groceries",
                category_id: "category-1",
                category_name: "Food",
                account_id: "account-1",
                account_name: "Checking",
                approved: true,
                cleared: "cleared",
                deleted: false,
                transfer_account_id: null
              }
            }
          })
        )
      );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    const transactions = await client.listTransactions("plan-1", "2026-03-01");
    const transaction = await client.getTransaction("plan-1", "transaction-1");

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://api.ynab.com/v1/budgets/plan-1/transactions?since_date=2026-03-01",
      expect.any(Object)
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.ynab.com/v1/budgets/plan-1/transactions/transaction-1",
      expect.any(Object)
    );
    expect(transactions).toMatchObject([
      {
        id: "transaction-1",
        date: "2026-03-15",
        amount: -123450,
        payeeId: "payee-1",
        payeeName: "Groceries",
        categoryId: "category-1",
        categoryName: "Food",
        accountId: "account-1",
        accountName: "Checking",
        approved: true,
        cleared: "cleared",
        deleted: false,
        transferAccountId: null
      }
    ]);
    expect(transaction).toMatchObject({
      id: "transaction-1",
      date: "2026-03-15",
      amount: -123450,
      payeeId: "payee-1",
      payeeName: "Groceries",
      categoryId: "category-1",
      categoryName: "Food",
      accountId: "account-1",
      accountName: "Checking",
      approved: true,
      cleared: "cleared",
      deleted: false,
      transferAccountId: null
    });
  });

  it("maps scheduled transaction endpoints into runtime-safe scheduled transaction shapes", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              scheduled_transactions: [
                {
                  id: "scheduled-1",
                  date_first: "2026-03-01",
                  date_next: "2026-04-01",
                  amount: -750000,
                  payee_name: "Rent",
                  category_name: "Housing",
                  account_name: "Checking",
                  deleted: false
                }
              ]
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              scheduled_transaction: {
                id: "scheduled-1",
                date_first: "2026-03-01",
                date_next: "2026-04-01",
                amount: -750000,
                payee_name: "Rent",
                category_name: "Housing",
                account_name: "Checking",
                deleted: false
              }
            }
          })
        )
      );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    const scheduledTransactions = await client.listScheduledTransactions("plan-1");
    const scheduledTransaction = await client.getScheduledTransaction("plan-1", "scheduled-1");

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://api.ynab.com/v1/budgets/plan-1/scheduled_transactions",
      expect.any(Object)
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.ynab.com/v1/budgets/plan-1/scheduled_transactions/scheduled-1",
      expect.any(Object)
    );
    expect(scheduledTransactions).toMatchObject([
      {
        id: "scheduled-1",
        dateFirst: "2026-03-01",
        dateNext: "2026-04-01",
        amount: -750000,
        payeeName: "Rent",
        categoryName: "Housing",
        accountName: "Checking",
        deleted: false
      }
    ]);
    expect(scheduledTransaction).toMatchObject({
      id: "scheduled-1",
      dateFirst: "2026-03-01",
      dateNext: "2026-04-01",
      amount: -750000,
      payeeName: "Rent",
      categoryName: "Housing",
      accountName: "Checking",
      deleted: false
    });
  });

  it("maps payee endpoints into runtime-safe payee shapes", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              payees: [
                {
                  id: "payee-1",
                  name: "Groceries",
                  transfer_account_id: null,
                  deleted: false
                }
              ]
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              payee: {
                id: "payee-1",
                name: "Groceries",
                transfer_account_id: null,
                deleted: false
              }
            }
          })
        )
      );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    const payees = await client.listPayees("plan-1");
    const payee = await client.getPayee("plan-1", "payee-1");

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://api.ynab.com/v1/budgets/plan-1/payees",
      expect.any(Object)
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.ynab.com/v1/budgets/plan-1/payees/payee-1",
      expect.any(Object)
    );
    expect(payees).toMatchObject([
      {
        id: "payee-1",
        name: "Groceries",
        transferAccountId: null,
        deleted: false
      }
    ]);
    expect(payee).toMatchObject({
      id: "payee-1",
      name: "Groceries",
      transferAccountId: null,
      deleted: false
    });
  });

  it("maps payee location endpoints into runtime-safe payee location shapes", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              payee_locations: [
                {
                  id: "location-1",
                  payee_id: "payee-1",
                  latitude: 30.2672,
                  longitude: -97.7431,
                  deleted: false
                }
              ]
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              payee_location: {
                id: "location-1",
                payee_id: "payee-1",
                latitude: 30.2672,
                longitude: -97.7431,
                deleted: false
              }
            }
          })
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              payee_locations: [
                {
                  id: "location-1",
                  payee_id: "payee-1",
                  latitude: 30.2672,
                  longitude: -97.7431,
                  deleted: false
                }
              ]
            }
          })
        )
      );
    const client = createYnabClient({
      accessToken: "token-123",
      baseUrl: "https://api.ynab.com/v1",
      fetchFn
    });

    const payeeLocations = await client.listPayeeLocations("plan-1");
    const payeeLocation = await client.getPayeeLocation("plan-1", "location-1");
    const payeeLocationsByPayee = await client.getPayeeLocationsByPayee("plan-1", "payee-1");

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      "https://api.ynab.com/v1/budgets/plan-1/payee_locations",
      expect.any(Object)
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      "https://api.ynab.com/v1/budgets/plan-1/payee_locations/location-1",
      expect.any(Object)
    );
    expect(fetchFn).toHaveBeenNthCalledWith(
      3,
      "https://api.ynab.com/v1/budgets/plan-1/payees/payee-1/payee_locations",
      expect.any(Object)
    );
    expect(payeeLocations).toMatchObject([
      {
        id: "location-1",
        payeeId: "payee-1",
        latitude: 30.2672,
        longitude: -97.7431,
        deleted: false
      }
    ]);
    expect(payeeLocation).toMatchObject({
      id: "location-1",
      payeeId: "payee-1",
      latitude: 30.2672,
      longitude: -97.7431,
      deleted: false
    });
    expect(payeeLocationsByPayee).toMatchObject([
      {
        id: "location-1",
        payeeId: "payee-1",
        latitude: 30.2672,
        longitude: -97.7431,
        deleted: false
      }
    ]);
  });
});
