import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../src/app/create-app.js";
import { createInMemoryOAuthStore } from "../../src/oauth/core/store.js";
import { signJwt } from "../../src/oauth/core/jwt.js";

const JWT_SIGNING_KEY = "jwt-signing-key-super-secret";
const YNAB_ACCESS_TOKEN = "ynab-pat-super-secret";

function createSecureEnv(): Env {
  return {
    JWT_SIGNING_KEY,
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_ACCESS_TOKEN,
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

describe("log secret leakage", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  afterEach(() => {
    consoleErrorSpy.mockClear();
    consoleWarnSpy.mockClear();
  });

  it("does not log configured secrets during unauthenticated MCP requests", async () => {
    // DEFECT: auth failures can write worker secrets into logs while building 401 responses.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    await app.request(
      "http://localhost/mcp",
      {
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
      },
      createSecureEnv()
    );

    const loggedText = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls].flat().join(" ");

    expect(loggedText).not.toContain(JWT_SIGNING_KEY);
    expect(loggedText).not.toContain(YNAB_ACCESS_TOKEN);
  });

  it("does not log configured secrets when MCP tool execution fails", async () => {
    // DEFECT: upstream tool failures can log raw secret-bearing error messages during MCP error handling.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore(),
      ynabClient: {
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
      }
    });
    const accessToken = await signJwt(
      {
        aud: "https://mcp.example.com/mcp",
        exp: Math.floor(Date.UTC(2026, 3, 23, 13, 0, 0) / 1000),
        iat: Math.floor(Date.UTC(2026, 3, 23, 12, 0, 0) / 1000),
        iss: "https://mcp.example.com/",
        jti: "jti-log-redaction",
        scope: "mcp",
        sub: "client-1"
      },
      JWT_SIGNING_KEY
    );

    await app.request(
      "http://localhost/mcp",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${accessToken}`,
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
      createSecureEnv()
    );

    const loggedText = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls].flat().join(" ");

    expect(loggedText).not.toContain(JWT_SIGNING_KEY);
    expect(loggedText).not.toContain(YNAB_ACCESS_TOKEN);
  });
});
