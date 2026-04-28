import { describe, expect, it } from "vitest";

import { YnabClientError, type YnabClient } from "../client.js";
import { createInitialPopulationService } from "./initial-population-service.js";

type CallName = keyof YnabClient;

function createFakeYnabClient(overrides: Partial<YnabClient> = {}) {
  const calls: CallName[] = [];
  const unsupported = (name: CallName) => async () => {
    calls.push(name);
    throw new Error(`${name} should not be called by initial population.`);
  };
  const client: YnabClient = {
    async getUser() {
      calls.push("getUser");

      return {
        id: "user-1",
        name: "Matt"
      };
    },
    async listPlans() {
      calls.push("listPlans");

      return {
        defaultPlan: {
          id: "plan-1",
          name: "Budget"
        },
        plans: [
          {
            id: "plan-1",
            name: "Budget"
          },
          {
            id: "plan-2",
            name: "Other"
          }
        ]
      };
    },
    async getPlan(planId) {
      calls.push("getPlan");

      return {
        firstMonth: "2026-04-01",
        id: planId,
        lastMonth: "2026-04-01",
        name: planId === "plan-2" ? "Other" : "Budget"
      };
    },
    async getPlanSettings() {
      calls.push("getPlanSettings");

      return {
        dateFormat: {
          format: "MM/DD/YYYY"
        }
      };
    },
    async listAccounts() {
      calls.push("listAccounts");

      return [
        {
          balance: 1000,
          closed: false,
          id: "account-1",
          name: "Checking",
          type: "checking"
        }
      ];
    },
    async listCategories() {
      calls.push("listCategories");

      return [
        {
          categories: [
            {
              deleted: false,
              hidden: false,
              id: "category-1",
              name: "Groceries"
            }
          ],
          deleted: false,
          hidden: false,
          id: "group-1",
          name: "Everyday"
        }
      ];
    },
    async listPlanMonths() {
      calls.push("listPlanMonths");

      return [
        {
          month: "2026-04-01"
        }
      ];
    },
    async getPlanMonth(_planId, month) {
      calls.push("getPlanMonth");

      return {
        categories: [
          {
            balance: 1000,
            id: "category-1",
            name: "Groceries"
          }
        ],
        month
      };
    },
    async listPayees() {
      calls.push("listPayees");

      return [
        {
          id: "payee-1",
          name: "Market"
        }
      ];
    },
    async listPayeeLocations() {
      calls.push("listPayeeLocations");

      return [
        {
          id: "location-1",
          payeeId: "payee-1"
        }
      ];
    },
    async listScheduledTransactions() {
      calls.push("listScheduledTransactions");

      return [
        {
          amount: -45000,
          dateFirst: "2026-04-01",
          id: "scheduled-1"
        }
      ];
    },
    async listTransactions() {
      calls.push("listTransactions");

      return [
        {
          amount: -12000,
          date: "2026-04-12",
          id: "txn-1"
        }
      ];
    },
    async listMoneyMovements() {
      calls.push("listMoneyMovements");

      return {
        moneyMovements: [
          {
            amount: 25000,
            id: "movement-1"
          }
        ],
        serverKnowledge: 456
      };
    },
    async listMoneyMovementGroups() {
      calls.push("listMoneyMovementGroups");

      return {
        moneyMovementGroups: [
          {
            groupCreatedAt: "2026-04-03T10:00:00Z",
            id: "movement-group-1",
            month: "2026-04-01"
          }
        ],
        serverKnowledge: 789
      };
    },
    getAccount: unsupported("getAccount"),
    getCategory: unsupported("getCategory"),
    getMonthCategory: unsupported("getMonthCategory"),
    listTransactionsByAccount: unsupported("listTransactionsByAccount"),
    listTransactionsByCategory: unsupported("listTransactionsByCategory"),
    listTransactionsByPayee: unsupported("listTransactionsByPayee"),
    getTransaction: unsupported("getTransaction"),
    getScheduledTransaction: unsupported("getScheduledTransaction"),
    getPayee: unsupported("getPayee"),
    getPayeeLocation: unsupported("getPayeeLocation"),
    getPayeeLocationsByPayee: unsupported("getPayeeLocationsByPayee"),
    ...overrides
  };

  return {
    calls,
    client
  };
}

function createFakeRepositories() {
  const writes: string[] = [];
  const seededSyncEndpoints: string[] = [];

  return {
    initialPopulationRepository: {
      async upsertUser() {
        writes.push("upsertUser");

        return { rowsUpserted: 1 };
      },
      async upsertPlans(input: { plans: unknown[] }) {
        writes.push("upsertPlans");

        return { rowsUpserted: input.plans.length };
      },
      async upsertPlanSettings() {
        writes.push("upsertPlanSettings");

        return { rowsUpserted: 1 };
      },
      async upsertAccounts(input: { accounts: unknown[] }) {
        writes.push("upsertAccounts");

        return { rowsUpserted: input.accounts.length };
      },
      async upsertCategoryGroups(input: { categoryGroups: Array<{ categories: unknown[] }> }) {
        writes.push("upsertCategoryGroups");

        return {
          categoriesUpserted: input.categoryGroups.reduce((total, group) => total + group.categories.length, 0),
          categoryGroupsUpserted: input.categoryGroups.length
        };
      },
      async upsertMonths(input: { months: Array<{ categories?: unknown[] }> }) {
        writes.push("upsertMonths");

        return {
          monthCategoriesUpserted: input.months.reduce((total, month) => total + (month.categories?.length ?? 0), 0),
          monthsUpserted: input.months.length
        };
      },
      async upsertPayees(input: { payees: unknown[] }) {
        writes.push("upsertPayees");

        return { rowsUpserted: input.payees.length };
      },
      async upsertPayeeLocations(input: { locations: unknown[] }) {
        writes.push("upsertPayeeLocations");

        return { rowsUpserted: input.locations.length };
      },
      async upsertScheduledTransactions(input: { scheduledTransactions: unknown[] }) {
        writes.push("upsertScheduledTransactions");

        return { rowsUpserted: input.scheduledTransactions.length };
      },
      async upsertMoneyMovements(input: { moneyMovements: unknown[] }) {
        writes.push("upsertMoneyMovements");

        return { rowsUpserted: input.moneyMovements.length };
      },
      async upsertMoneyMovementGroups(input: { moneyMovementGroups: unknown[] }) {
        writes.push("upsertMoneyMovementGroups");

        return { rowsUpserted: input.moneyMovementGroups.length };
      }
    },
    transactionsRepository: {
      async upsertTransactions(input: { transactions: unknown[] }) {
        writes.push("upsertTransactions");

        return {
          rowsDeleted: 0,
          rowsUpserted: input.transactions.length
        };
      }
    },
    syncStateRepository: {
      async acquireLease(input: { endpoint: string }) {
        seededSyncEndpoints.push(`lease:${input.endpoint}`);

        return {
          acquired: true as const,
          leaseExpiresAt: "2026-04-28T12:01:00.000Z"
        };
      },
      async advanceCursor(input: { endpoint: string; serverKnowledge: number }) {
        seededSyncEndpoints.push(`${input.endpoint}:${input.serverKnowledge}`);

        return {
          advanced: true as const
        };
      }
    },
    seededSyncEndpoints,
    writes
  };
}

describe("initial population service", () => {
  it("uses a full plan export for known-plan bootstrap to minimize YNAB requests", async () => {
    const { calls, client } = createFakeYnabClient({
      async getPlanExport(planId) {
        calls.push("getPlanExport" as CallName);

        return {
          plan: {
            accounts: [
              {
                balance: 1000,
                closed: false,
                id: "account-1",
                name: "Checking",
                type: "checking"
              }
            ],
            categoryGroups: [
              {
                categories: [
                  {
                    deleted: false,
                    hidden: false,
                    id: "category-1",
                    name: "Groceries"
                  }
                ],
                deleted: false,
                hidden: false,
                id: "group-1",
                name: "Everyday"
              }
            ],
            firstMonth: "2026-04-01",
            id: planId,
            lastMonth: "2026-04-01",
            months: [
              {
                categories: [
                  {
                    balance: 1000,
                    id: "category-1",
                    name: "Groceries"
                  }
                ],
                month: "2026-04-01"
              }
            ],
            name: "Budget",
            payeeLocations: [
              {
                id: "location-1",
                payeeId: "payee-1"
              }
            ],
            payees: [
              {
                id: "payee-1",
                name: "Market"
              }
            ],
            scheduledTransactions: [
              {
                amount: -45000,
                dateFirst: "2026-04-01",
                id: "scheduled-1"
              }
            ],
            transactions: [
              {
                amount: -12000,
                date: "2026-04-12",
                id: "txn-1"
              }
            ]
          },
          serverKnowledge: 123
        };
      }
    });
    const repositories = createFakeRepositories();
    const service = createInitialPopulationService({
      defaultPlanId: "plan-1",
      initialPopulationRepository: repositories.initialPopulationRepository,
      maxRequests: 50,
      now: () => "2026-04-28T12:00:00.000Z",
      syncStateRepository: repositories.syncStateRepository,
      transactionsRepository: repositories.transactionsRepository,
      ynabClient: client
    });

    const result = await service.populate({
      confirm: true
    });

    expect(result).toMatchObject({
      planIds: ["plan-1"],
      requestsUsed: 3,
      status: "ok"
    });
    expect(result.rows).toMatchObject({
      accounts: 1,
      categories: 1,
      moneyMovementGroups: 1,
      moneyMovements: 1,
      monthCategories: 1,
      months: 1,
      payeeLocations: 1,
      payees: 1,
      plans: 1,
      scheduledTransactions: 1,
      transactions: 1,
      users: 0
    });
    expect(calls).toEqual(["getPlanExport", "listMoneyMovements", "listMoneyMovementGroups"]);
    expect(repositories.seededSyncEndpoints).toEqual([
      "lease:plans",
      "plans:123",
      "lease:plan_settings",
      "plan_settings:123",
      "lease:accounts",
      "accounts:123",
      "lease:categories",
      "categories:123",
      "lease:months",
      "months:123",
      "lease:payees",
      "payees:123",
      "lease:payee_locations",
      "payee_locations:123",
      "lease:scheduled_transactions",
      "scheduled_transactions:123",
      "lease:transactions",
      "transactions:123",
      "lease:money_movements",
      "money_movements:789"
    ]);
  });

  it("uses one full export per plan when explicitly populating all plans", async () => {
    const { calls, client } = createFakeYnabClient({
      async getPlanExport(planId) {
        calls.push("getPlanExport" as CallName);

        return {
          plan: {
            accounts: [],
            categoryGroups: [],
            firstMonth: "2026-04-01",
            id: planId,
            lastMonth: "2026-04-01",
            months: [],
            name: planId === "plan-2" ? "Other" : "Budget",
            payeeLocations: [],
            payees: [],
            scheduledTransactions: [],
            transactions: []
          },
          serverKnowledge: 123
        };
      }
    });
    const repositories = createFakeRepositories();
    const service = createInitialPopulationService({
      initialPopulationRepository: repositories.initialPopulationRepository,
      maxRequests: 50,
      now: () => "2026-04-28T12:00:00.000Z",
      transactionsRepository: repositories.transactionsRepository,
      ynabClient: client
    });

    const result = await service.populate({
      dryRun: true,
      includeAllPlans: true
    });

    expect(result).toMatchObject({
      planIds: ["plan-1", "plan-2"],
      requestsUsed: 7,
      status: "ok"
    });
    expect(calls).toEqual([
      "listPlans",
      "getPlanExport",
      "listMoneyMovements",
      "listMoneyMovementGroups",
      "getPlanExport",
      "listMoneyMovements",
      "listMoneyMovementGroups"
    ]);
  });

  it("discovers a real plan id before exporting when no plan id is configured", async () => {
    const { calls, client } = createFakeYnabClient({
      async getPlanExport(planId) {
        calls.push("getPlanExport" as CallName);

        return {
          plan: {
            accounts: [],
            categoryGroups: [],
            id: planId,
            months: [],
            name: "Budget",
            payeeLocations: [],
            payees: [],
            scheduledTransactions: [],
            transactions: []
          },
          serverKnowledge: 123
        };
      }
    });
    const repositories = createFakeRepositories();
    const service = createInitialPopulationService({
      initialPopulationRepository: repositories.initialPopulationRepository,
      maxRequests: 50,
      now: () => "2026-04-28T12:00:00.000Z",
      transactionsRepository: repositories.transactionsRepository,
      ynabClient: client
    });

    const result = await service.populate({
      dryRun: true
    });

    expect(result).toMatchObject({
      planIds: ["plan-1"],
      requestsUsed: 4,
      status: "ok"
    });
    expect(calls).toEqual(["listPlans", "getPlanExport", "listMoneyMovements", "listMoneyMovementGroups"]);
  });

  it("dry-runs one plan with broad YNAB endpoints and no D1 writes", async () => {
    const { calls, client } = createFakeYnabClient();
    const repositories = createFakeRepositories();
    const service = createInitialPopulationService({
      defaultPlanId: "plan-1",
      initialPopulationRepository: repositories.initialPopulationRepository,
      maxRequests: 50,
      now: () => "2026-04-28T12:00:00.000Z",
      transactionsRepository: repositories.transactionsRepository,
      ynabClient: client
    });

    const result = await service.populate({
      dryRun: true
    });

    expect(result).toMatchObject({
      dryRun: true,
      planIds: ["plan-1"],
      requestsUsed: 13,
      status: "ok"
    });
    expect(repositories.writes).toEqual([]);
    expect(calls).toEqual([
      "getUser",
      "getPlan",
      "getPlanSettings",
      "listAccounts",
      "listCategories",
      "listPlanMonths",
      "getPlanMonth",
      "listPayees",
      "listPayeeLocations",
      "listScheduledTransactions",
      "listTransactions",
      "listMoneyMovements",
      "listMoneyMovementGroups"
    ]);
  });

  it("requires explicit all-plan population instead of fanning out by default", async () => {
    const { client } = createFakeYnabClient();
    const repositories = createFakeRepositories();
    const service = createInitialPopulationService({
      initialPopulationRepository: repositories.initialPopulationRepository,
      maxRequests: 50,
      now: () => "2026-04-28T12:00:00.000Z",
      transactionsRepository: repositories.transactionsRepository,
      ynabClient: client
    });

    const singlePlanResult = await service.populate({
      dryRun: true
    });
    const allPlansResult = await service.populate({
      dryRun: true,
      includeAllPlans: true
    });

    expect(singlePlanResult.planIds).toEqual(["plan-1"]);
    expect(allPlansResult.planIds).toEqual(["plan-1", "plan-2"]);
  });

  it("refuses to continue before exceeding the configured request budget", async () => {
    const { client } = createFakeYnabClient();
    const repositories = createFakeRepositories();
    const service = createInitialPopulationService({
      defaultPlanId: "plan-1",
      initialPopulationRepository: repositories.initialPopulationRepository,
      maxRequests: 3,
      now: () => "2026-04-28T12:00:00.000Z",
      transactionsRepository: repositories.transactionsRepository,
      ynabClient: client
    });

    const result = await service.populate({
      confirm: true
    });

    expect(result).toMatchObject({
      error: "Initial population stopped before exceeding the request budget of 3.",
      requestsUsed: 3,
      status: "failed"
    });
    expect(repositories.writes).toEqual([]);
  });

  it("writes confirmed population results and returns row counts", async () => {
    const { client } = createFakeYnabClient();
    const repositories = createFakeRepositories();
    const service = createInitialPopulationService({
      defaultPlanId: "plan-1",
      initialPopulationRepository: repositories.initialPopulationRepository,
      maxRequests: 50,
      now: () => "2026-04-28T12:00:00.000Z",
      transactionsRepository: repositories.transactionsRepository,
      ynabClient: client
    });

    const result = await service.populate({
      confirm: true
    });

    expect(result).toEqual({
      dryRun: false,
      planIds: ["plan-1"],
      requestsUsed: 13,
      rows: {
        accounts: 1,
        categoryGroups: 1,
        categories: 1,
        moneyMovementGroups: 1,
        moneyMovements: 1,
        monthCategories: 1,
        months: 1,
        payeeLocations: 1,
        payees: 1,
        planSettings: 1,
        plans: 1,
        scheduledTransactions: 1,
        transactions: 1,
        transactionTombstones: 0,
        users: 1
      },
      status: "ok"
    });
    expect(repositories.writes).toEqual([
      "upsertUser",
      "upsertPlans",
      "upsertPlanSettings",
      "upsertAccounts",
      "upsertCategoryGroups",
      "upsertMonths",
      "upsertPayees",
      "upsertPayeeLocations",
      "upsertScheduledTransactions",
      "upsertTransactions",
      "upsertMoneyMovements",
      "upsertMoneyMovementGroups"
    ]);
  });

  it("stops cleanly when YNAB reports a rate limit", async () => {
    const { client } = createFakeYnabClient({
      async listAccounts() {
        throw new YnabClientError("Too many requests", "rate_limit", true);
      }
    });
    const repositories = createFakeRepositories();
    const service = createInitialPopulationService({
      defaultPlanId: "plan-1",
      initialPopulationRepository: repositories.initialPopulationRepository,
      maxRequests: 50,
      now: () => "2026-04-28T12:00:00.000Z",
      transactionsRepository: repositories.transactionsRepository,
      ynabClient: client
    });

    const result = await service.populate({
      confirm: true
    });

    expect(result).toMatchObject({
      error: "YNAB API rate limit reached. Stop and retry after the rolling hourly window has capacity.",
      status: "failed"
    });
    expect(repositories.writes).toEqual([]);
  });
});
