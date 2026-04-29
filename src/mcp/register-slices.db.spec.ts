import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { getRegisteredToolDefinitions } from "../app/tool-definitions.js";
import type { AppEnv } from "../shared/env.js";
import type { SliceToolDefinition } from "../shared/tool-definition.js";
import { DISCOVERY_TOOL_NAMES } from "./discovery.js";

function executeToolDefinition(
  definition: SliceToolDefinition | undefined,
  input: unknown,
) {
  return (definition as SliceToolDefinition<unknown> | undefined)?.execute(
    input,
  );
}

class FakeStatement {
  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new FakeStatement(
      this.db,
      this.sql,
      params,
    ) as unknown as D1PreparedStatement;
  }

  all<T>() {
    this.db.allCalls.push({ sql: this.sql, params: this.params });

    if (this.sql.includes("FROM ynab_sync_state")) {
      return Promise.resolve({
        results: this.params.slice(1).map((endpoint) => ({
          endpoint,
          health_status:
            this.db.endpointHealthStatuses.get(String(endpoint)) ??
            this.db.healthStatus,
          last_successful_sync_at: "2026-04-28T12:00:00.000Z",
        })),
      } as D1Result<T>);
    }

    if (this.sql.includes("FROM ynab_plans")) {
      return Promise.resolve({
        results: this.db.plans,
      } as D1Result<T>);
    }

    if (this.sql.includes("FROM ynab_money_movements")) {
      return Promise.resolve({
        results: [
          {
            id: "move-1",
            month: "2026-04-01",
            moved_at: "2026-04-12T10:00:00.000Z",
            note: "Cover groceries",
            money_movement_group_id: "movement-group-1",
            performed_by_user_id: "user-1",
            from_category_id: "category-ready",
            from_category_name: "Ready to Assign",
            to_category_id: "category-grocery",
            to_category_name: "Groceries",
            amount_milliunits: 12000,
            deleted: 0,
          },
        ],
      } as D1Result<T>);
    }

    if (this.sql.includes("FROM ynab_scheduled_transactions")) {
      return Promise.resolve({
        results: [
          {
            id: "scheduled-1",
            date_first: "2026-04-01",
            date_next: "2026-05-01",
            amount_milliunits: -45000,
            payee_name: "Rent",
            category_name: "Housing",
            account_name: "Checking",
            flag_color: "blue",
            flag_name: "review",
            deleted: 0,
          },
        ],
      } as D1Result<T>);
    }

    if (this.sql.includes("COUNT(*) AS count")) {
      return Promise.resolve({
        results: [{ count: 1 }],
      } as D1Result<T>);
    }

    this.db.transactionSearchParams = this.params;
    return Promise.resolve({
      results: [
        {
          id: "txn-1",
          date: "2026-04-12",
          amount_milliunits: -12000,
          account_id: "account-1",
          payee_name: "Market",
          category_name: "Groceries",
          account_name: "Checking",
          deleted: 0,
        },
      ],
    } as D1Result<T>);
  }
}

class FakeD1Database {
  allCalls: Array<{ sql: string; params: unknown[] }> = [];
  endpointHealthStatuses = new Map<string, string>();
  healthStatus = "ok";
  plans: Array<{ id: string; name: string; deleted: number }> = [
    { id: "plan-1", name: "Household", deleted: 0 },
  ];
  transactionSearchParams: unknown[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }
}

function createD1Env(
  database?: D1Database,
  defaultPlanId: string | null = "plan-1",
): AppEnv {
  return {
    mcpServerName: "ynab-mcp-build",
    mcpServerVersion: "0.1.0",
    oauthEnabled: false,
    ynabApiBaseUrl: "https://api.ynab.com/v1",
    ...(database ? { ynabDatabase: database } : {}),
    ...(defaultPlanId ? { ynabDefaultPlanId: defaultPlanId } : {}),
    ynabReadSource: "d1",
    ynabStaleAfterMinutes: 360,
  };
}

describe("DB-backed tool registration", () => {
  it("requires a D1 database binding in D1 mode", () => {
    expect(() => getRegisteredToolDefinitions(createD1Env(), {})).toThrowError(
      "YNAB_DB is required when YNAB_READ_SOURCE=d1.",
    );
  });

  it("registers existing public tool names in D1 mode without direct YNAB dependencies", async () => {
    const database = new FakeD1Database();
    const definitions = getRegisteredToolDefinitions(
      createD1Env(database as unknown as D1Database),
      {
        now: () => Date.parse("2026-04-28T12:01:00.000Z"),
      },
    );
    const names = definitions.map((definition) => definition.name).sort();

    expect(names).toEqual([...DISCOVERY_TOOL_NAMES].sort());

    const searchTransactions = definitions.find(
      (definition) => definition.name === "ynab_search_transactions",
    );
    await expect(
      executeToolDefinition(searchTransactions, {
        accountId: "account-1",
        limit: 5,
        maxAmount: -10000,
        minAmount: -15000,
      }),
    ).resolves.toMatchObject({
      status: "ok",
      data: {
        match_count: 1,
      },
    });
    expect(database.allCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          params: expect.arrayContaining(["plan-1"]),
        }),
      ]),
    );
    expect(
      database.allCalls.some((call) =>
        call.sql.includes("FROM ynab_transactions"),
      ),
    ).toBe(true);
    expect(database.transactionSearchParams).toEqual(
      expect.arrayContaining(["plan-1", "account-1", -15000, -10000, 5]),
    );

    const moneyMovements = definitions.find(
      (definition) => definition.name === "ynab_get_money_movements",
    );
    await expect(
      executeToolDefinition(moneyMovements, {}),
    ).resolves.toMatchObject({
      status: "ok",
      data_freshness: {
        required_endpoints: ["money_movements"],
      },
      data: {
        money_movements: [
          {
            id: "move-1",
            amount: "12.00",
            from_category_name: "Ready to Assign",
            to_category_name: "Groceries",
          },
        ],
      },
    });
    expect(
      database.allCalls.some((call) =>
        call.sql.includes("FROM ynab_money_movements"),
      ),
    ).toBe(true);

    const scheduledTransactions = definitions.find(
      (definition) => definition.name === "ynab_list_scheduled_transactions",
    );
    await expect(
      executeToolDefinition(scheduledTransactions, {}),
    ).resolves.toMatchObject({
      status: "ok",
      data_freshness: {
        required_endpoints: ["scheduled_transactions"],
      },
      data: {
        scheduled_transactions: [
          {
            id: "scheduled-1",
            amount: "-45.00",
            payee_name: "Rent",
            flag_color: "blue",
          },
        ],
      },
    });
    expect(
      database.allCalls.some((call) =>
        call.sql.includes("FROM ynab_scheduled_transactions"),
      ),
    ).toBe(true);

    const unavailableMessages = await Promise.all(
      definitions.map(async (definition) => {
        try {
          await executeToolDefinition(definition, {});
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      }),
    );

    expect(unavailableMessages.filter(Boolean)).not.toContainEqual(
      expect.stringContaining("is not available yet in DB-backed read mode."),
    );
  });

  it("keeps tool registration D1-only without alternate read-source branches", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "tool-definitions.ts"),
      "utf8",
    );
    const database = new FakeD1Database();
    const names = getRegisteredToolDefinitions(
      createD1Env(database as unknown as D1Database),
      {},
    ).map((definition) => definition.name);

    expect(names).not.toContain("ynab_admin_populate_d1");
    expect(source).not.toContain("resolveYnabClient");
    expect(source).not.toContain("ynabReadSource");
  });

  it("does not register the removed temporary D1 population tool even with old dashboard flags", () => {
    const database = new FakeD1Database();
    const definitions = getRegisteredToolDefinitions(
      {
        ...createD1Env(database as unknown as D1Database),
        ynabAccessToken: "token",
        ynabTempPopulationToolEnabled: true,
      } as AppEnv & { ynabTempPopulationToolEnabled: boolean },
      {},
    );
    const names = definitions.map((definition) => definition.name);

    expect(names).not.toContain("ynab_admin_populate_d1");
  });

  it("uses explicit non-blank input plan ids for read-model freshness checks", async () => {
    const database = new FakeD1Database();
    const definitions = getRegisteredToolDefinitions(
      createD1Env(database as unknown as D1Database),
      {},
    );
    const searchTransactions = definitions.find(
      (definition) => definition.name === "ynab_search_transactions",
    );

    await expect(
      executeToolDefinition(searchTransactions, {
        limit: 5,
        planId: "plan-explicit",
      }),
    ).resolves.toHaveProperty("data");

    expect(database.allCalls[0]?.params).toEqual(
      expect.arrayContaining(["plan-explicit"]),
    );
  });

  it("falls back to the default plan when input plan ids are blank", async () => {
    const database = new FakeD1Database();
    const definitions = getRegisteredToolDefinitions(
      createD1Env(database as unknown as D1Database),
      {},
    );
    const searchTransactions = definitions.find(
      (definition) => definition.name === "ynab_search_transactions",
    );

    await expect(
      executeToolDefinition(searchTransactions, { limit: 5, planId: "   " }),
    ).resolves.toHaveProperty("data");

    expect(database.allCalls[0]?.params).toEqual(
      expect.arrayContaining(["plan-1"]),
    );
  });

  it("auto-populates omitted plan ids from the synced read-model plan", async () => {
    const database = new FakeD1Database();
    const definitions = getRegisteredToolDefinitions(
      createD1Env(database as unknown as D1Database, null),
      {
        now: () => Date.parse("2026-04-28T12:01:00.000Z"),
      },
    );
    const moneyMovements = definitions.find(
      (definition) => definition.name === "ynab_get_money_movements",
    );

    await expect(
      executeToolDefinition(moneyMovements, {}),
    ).resolves.toMatchObject({
      status: "ok",
      data: {
        movement_count: 1,
      },
    });

    expect(database.allCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("FROM ynab_money_movements"),
          params: expect.arrayContaining(["plan-1"]),
        }),
      ]),
    );
  });

  it("requires plan ids for freshness checks when no default plan is configured", async () => {
    const database = new FakeD1Database();
    database.plans = [];
    const definitions = getRegisteredToolDefinitions(
      createD1Env(database as unknown as D1Database, null),
      {},
    );
    const searchTransactions = definitions.find(
      (definition) => definition.name === "ynab_search_transactions",
    );

    await expect(
      executeToolDefinition(searchTransactions, { limit: 5 }),
    ).rejects.toThrowError(
      "planId is required when YNAB_DEFAULT_PLAN_ID is not configured.",
    );
  });

  it("short-circuits read-model tools when required sync data is unhealthy", async () => {
    const database = new FakeD1Database();
    database.healthStatus = "unhealthy";
    const definitions = getRegisteredToolDefinitions(
      createD1Env(database as unknown as D1Database),
      {},
    );
    const searchTransactions = definitions.find(
      (definition) => definition.name === "ynab_search_transactions",
    );

    await expect(
      executeToolDefinition(searchTransactions, { limit: 5 }),
    ).resolves.toMatchObject({
      status: "unhealthy",
      data_freshness: {
        health_status: "unhealthy",
        required_endpoints: ["transactions"],
      },
      next_action: {
        code: "sync_read_model",
        message: expect.stringContaining(
          "Run the scheduled YNAB read-model sync",
        ),
      },
      data: null,
    });

    expect(
      database.allCalls.some((call) =>
        call.sql.includes("FROM ynab_transactions"),
      ),
    ).toBe(false);
  });

  it("checks transaction freshness for compound monthly review tools before reading data", async () => {
    const database = new FakeD1Database();
    database.endpointHealthStatuses.set("transactions", "unhealthy");
    const definitions = getRegisteredToolDefinitions(
      createD1Env(database as unknown as D1Database),
      {},
    );
    const monthlyReview = definitions.find(
      (definition) => definition.name === "ynab_get_monthly_review",
    );

    await expect(
      executeToolDefinition(monthlyReview, { month: "2026-04-01" }),
    ).resolves.toMatchObject({
      status: "unhealthy",
      data_freshness: {
        health_status: "unhealthy",
        required_endpoints: expect.arrayContaining([
          "categories",
          "months",
          "transactions",
        ]),
      },
      data: null,
    });

    expect(
      database.allCalls.some((call) => call.sql.includes("FROM ynab_months")),
    ).toBe(false);
    expect(
      database.allCalls.some((call) =>
        call.sql.includes("FROM ynab_transactions"),
      ),
    ).toBe(false);
  });

  it("requires all count sources before reading plan details", async () => {
    const database = new FakeD1Database();
    database.endpointHealthStatuses.set("accounts", "unhealthy");
    const definitions = getRegisteredToolDefinitions(
      createD1Env(database as unknown as D1Database),
      {},
    );
    const getPlan = definitions.find(
      (definition) => definition.name === "ynab_get_plan",
    );

    await expect(executeToolDefinition(getPlan, {})).resolves.toMatchObject({
      status: "unhealthy",
      data_freshness: {
        health_status: "unhealthy",
        required_endpoints: ["plans", "accounts", "categories", "payees"],
      },
      data: null,
    });

    expect(
      database.allCalls.some((call) => call.sql.includes("FROM ynab_plans")),
    ).toBe(false);
    expect(
      database.allCalls.some((call) => call.sql.includes("FROM ynab_accounts")),
    ).toBe(false);
  });

  it("does not require month sync for category detail tools", async () => {
    const database = new FakeD1Database();
    database.endpointHealthStatuses.set("months", "unhealthy");
    const definitions = getRegisteredToolDefinitions(
      createD1Env(database as unknown as D1Database),
      {
        now: () => Date.parse("2026-04-28T12:01:00.000Z"),
      },
    );
    const getCategory = definitions.find(
      (definition) => definition.name === "ynab_get_category",
    );

    await expect(
      executeToolDefinition(getCategory, { categoryId: "category-1" }),
    ).resolves.toMatchObject({
      status: "ok",
      data_freshness: {
        required_endpoints: ["categories"],
      },
    });
  });
});
