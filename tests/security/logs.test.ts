import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/app/create-app.js";
import {
  createOAuthEnv,
  fetchWorker,
  MCP_RESOURCE
} from "../helpers/oauth-provider.js";

const JWT_SIGNING_KEY = "jwt-signing-key-super-secret";
const YNAB_ACCESS_TOKEN = "ynab-pat-super-secret";

function createSecureOAuthEnv(): Env {
  return createOAuthEnv({
    JWT_SIGNING_KEY,
    YNAB_ACCESS_TOKEN
  } as Partial<Env>);
}

function createPlainEnv(): Env {
  return {
    JWT_SIGNING_KEY,
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_ACCESS_TOKEN,
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

function createFailingYnabClient() {
  return {
    getUser: async () => {
      throw new Error(`Authorization: Bearer ${YNAB_ACCESS_TOKEN} JWT_SIGNING_KEY=${JWT_SIGNING_KEY}`);
    },
    listPlans: async () => [],
    getPlan: async () => ({ id: "plan-1", name: "Plan" }),
    listCategories: async () => [],
    getCategory: async () => ({ hidden: false, id: "category-1", name: "Category" }),
    getMonthCategory: async () => ({ hidden: false, id: "category-1", name: "Category" }),
    getPlanSettings: async () => ({}),
    listPlanMonths: async () => [],
    getPlanMonth: async () => ({ month: "2026-04-01" }),
    listAccounts: async () => [],
    getAccount: async () => ({ closed: false, id: "account-1", name: "Checking", type: "checking" }),
    listTransactions: async () => [],
    getTransaction: async () => ({ amount: 0, date: "2026-04-01", id: "txn-1" }),
    listScheduledTransactions: async () => [],
    getScheduledTransaction: async () => ({ amount: 0, dateFirst: "2026-04-01", id: "sched-1" }),
    listPayees: async () => [],
    getPayee: async () => ({ id: "payee-1", name: "Payee" }),
    listPayeeLocations: async () => [],
    getPayeeLocation: async () => ({ id: "location-1" }),
    getPayeeLocationsByPayee: async () => []
  };
}

describe("log secret leakage", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  afterEach(() => {
    consoleErrorSpy.mockClear();
    consoleWarnSpy.mockClear();
  });

  it("does not log configured secrets during unauthenticated provider requests", async () => {
    await fetchWorker(
      new Request(MCP_RESOURCE, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/list",
          params: {}
        })
      }),
      createSecureOAuthEnv()
    );

    const loggedText = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls].flat().join(" ");

    expect(loggedText).not.toContain(JWT_SIGNING_KEY);
    expect(loggedText).not.toContain(YNAB_ACCESS_TOKEN);
  });

  it("does not log configured secrets when MCP tool execution fails", async () => {
    const app = createApp({
      ynabClient: createFailingYnabClient()
    });

    await app.request(
      "http://localhost/mcp",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {},
            name: "ynab_get_user"
          }
        })
      },
      createPlainEnv()
    );

    const loggedText = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls].flat().join(" ");

    expect(loggedText).not.toContain(JWT_SIGNING_KEY);
    expect(loggedText).not.toContain(YNAB_ACCESS_TOKEN);
  });
});
