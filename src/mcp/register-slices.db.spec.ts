import { describe, expect, it } from "vitest";

import type { AppEnv } from "../shared/env.js";
import { DISCOVERY_TOOL_NAMES } from "./discovery.js";
import { getRegisteredToolDefinitions } from "./register-slices.js";

class FakeStatement {
  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
    private readonly params: unknown[] = []
  ) {}

  bind(...params: unknown[]) {
    return new FakeStatement(this.db, this.sql, params) as unknown as D1PreparedStatement;
  }

  all<T>() {
    this.db.allCalls.push({ sql: this.sql, params: this.params });

    if (this.sql.includes("FROM ynab_sync_state")) {
      return Promise.resolve({
        results: [
          {
            endpoint: "transactions",
            health_status: "ok",
            last_successful_sync_at: "2026-04-28T12:00:00.000Z"
          }
        ]
      } as D1Result<T>);
    }

    this.db.transactionSearchParams = this.params;

    return Promise.resolve({
      results: [
        {
          id: "txn-1",
          date: "2026-04-12",
          amount_milliunits: -12000,
          payee_name: "Market",
          category_name: "Groceries",
          account_name: "Checking",
          deleted: 0
        }
      ]
    } as D1Result<T>);
  }
}

class FakeD1Database {
  allCalls: Array<{ sql: string; params: unknown[] }> = [];
  transactionSearchParams: unknown[] = [];

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }
}

function createD1Env(database: D1Database): AppEnv {
  return {
    mcpServerName: "ynab-mcp-build",
    mcpServerVersion: "0.1.0",
    oauthEnabled: false,
    ynabApiBaseUrl: "https://api.ynab.com/v1",
    ynabDatabase: database,
    ynabDefaultPlanId: "plan-1",
    ynabReadSource: "d1",
    ynabStaleAfterMinutes: 360,
    ynabSyncMaxRowsPerRun: 100
  };
}

describe("DB-backed tool registration", () => {
  it("registers existing public tool names in D1 mode without live YNAB dependencies", async () => {
    const database = new FakeD1Database();
    const definitions = getRegisteredToolDefinitions(createD1Env(database as unknown as D1Database), {
      now: () => Date.parse("2026-04-28T12:01:00.000Z")
    });
    const names = definitions.map((definition) => definition.name).sort();

    expect(names).toEqual([...DISCOVERY_TOOL_NAMES].sort());

    const searchTransactions = definitions.find((definition) => definition.name === "ynab_search_transactions");
    await expect(searchTransactions?.execute({ limit: 5 })).resolves.toMatchObject({
      status: "ok",
      data: {
        match_count: 1
      }
    });
    expect(database.allCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          params: expect.arrayContaining(["plan-1"])
        })
      ])
    );

    const unavailableMessages = await Promise.all(
      definitions.map(async (definition) => {
        try {
          await definition.execute({});
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      })
    );

    expect(unavailableMessages.filter(Boolean)).not.toContainEqual(
      expect.stringContaining("is not available yet in DB-backed read mode.")
    );
  });
});
