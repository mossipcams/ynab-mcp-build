import { describe, expect, it } from "vitest";

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

describe("response secret leakage", () => {
  it("does not leak configured secrets in oauth bearer-auth error bodies", async () => {
    // DEFECT: worker secrets can be reflected in OAuth error responses and become readable by unauthenticated clients.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore()
    });

    const response = await app.request(
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
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(body).not.toContain(JWT_SIGNING_KEY);
    expect(body).not.toContain(YNAB_ACCESS_TOKEN);
  });

  it("does not leak configured secrets in oauth configuration error bodies", async () => {
    // DEFECT: server misconfiguration responses can accidentally serialize worker secrets while reporting startup failures.
    const app = createApp();
    const response = await app.request(
      "http://localhost/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none"
        })
      },
      createSecureEnv()
    );
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).not.toContain(JWT_SIGNING_KEY);
    expect(body).not.toContain(YNAB_ACCESS_TOKEN);
  });

  it("redacts bearer token values from MCP tool error responses", async () => {
    // DEFECT: upstream tool failures can echo raw Authorization header values back to the MCP client.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore(),
      ynabClient: {
        getUser: async () => {
          throw new Error(`Upstream sent Authorization: Bearer ${YNAB_ACCESS_TOKEN}`);
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
        exp: Math.floor(Date.UTC(2030, 0, 1, 0, 0, 0) / 1000),
        iat: Math.floor(Date.UTC(2026, 3, 23, 12, 0, 0) / 1000),
        iss: "https://mcp.example.com/",
        jti: "jti-tool-redaction",
        scope: "mcp",
        sub: "client-1"
      },
      JWT_SIGNING_KEY
    );

    const response = await app.request(
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
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain(YNAB_ACCESS_TOKEN);
    expect(body).not.toContain(`Authorization: Bearer ${YNAB_ACCESS_TOKEN}`);
  });

  it("redacts secret-style key assignments from MCP tool error responses", async () => {
    // DEFECT: tool failures can serialize secret assignment strings and expose worker signing material to the client.
    const app = createApp({
      oauthStore: createInMemoryOAuthStore(),
      ynabClient: {
        getUser: async () => {
          throw new Error(`JWT_SIGNING_KEY=${JWT_SIGNING_KEY}`);
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
        exp: Math.floor(Date.UTC(2030, 0, 1, 0, 0, 0) / 1000),
        iat: Math.floor(Date.UTC(2026, 3, 23, 12, 0, 0) / 1000),
        iss: "https://mcp.example.com/",
        jti: "jti-key-redaction",
        scope: "mcp",
        sub: "client-1"
      },
      JWT_SIGNING_KEY
    );

    const response = await app.request(
      "http://localhost/mcp",
      {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: 2,
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
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain(JWT_SIGNING_KEY);
    expect(body).not.toContain(`JWT_SIGNING_KEY=${JWT_SIGNING_KEY}`);
  });

  it("does not leak absolute file paths in oauth error responses", async () => {
    // DEFECT: oauth adapter errors can expose local file-system paths from thrown exceptions.
    const app = createApp({
      oauthStore: {
        async getAccessToken() {
          return undefined;
        },
        async getAuthorizationCode() {
          return undefined;
        },
        async getRegisteredClient() {
          return undefined;
        },
        async issueAccessToken() {},
        async issueAuthorizationCode() {},
        async issueRefreshToken() {},
        async registerClient() {
          throw new Error("failed at /Users/matt/Desktop/Projects/ynab-mcp-build-ci/src/oauth/http/routes.ts:123:45");
        },
        async rotateRefreshToken() {
          return {
            status: "not_found" as const
          };
        },
        async useAuthorizationCode() {
          return undefined;
        }
      }
    });

    const response = await app.request(
      "http://localhost/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none"
        })
      },
      createSecureEnv()
    );
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).not.toContain("/Users/matt/Desktop/Projects/ynab-mcp-build-ci");
    expect(body).not.toContain("src/oauth/http/routes.ts");
  });
});
