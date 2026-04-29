import { describe, expect, it } from "vitest";

import { createApp } from "../../src/app/create-app.js";
import {
  createOAuthEnv,
  fetchWorker,
  MCP_RESOURCE,
  REDIRECT_URI,
  registerClient,
  requestAuthorization,
} from "../helpers/oauth-provider.js";

const JWT_SIGNING_KEY = "jwt-signing-key-super-secret";
const YNAB_ACCESS_TOKEN = "ynab-pat-super-secret";

function createSecureOAuthEnv(): Env {
  return createOAuthEnv({
    JWT_SIGNING_KEY,
    YNAB_ACCESS_TOKEN,
  } as Partial<Env>);
}

function createPlainEnv(): Env {
  return {
    JWT_SIGNING_KEY,
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    YNAB_ACCESS_TOKEN,
    YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    YNAB_DB: {} as D1Database,
    YNAB_READ_SOURCE: "d1",
  } as unknown as Env;
}

function createFailingD1Database(message: string): D1Database {
  return {
    prepare() {
      return {
        bind() {
          return {
            async all() {
              throw new Error(message);
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

async function callUserToolWithFailure(message: string) {
  const app = createApp();

  return app.request(
    "http://localhost/mcp",
    {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          arguments: {},
          name: "ynab_get_user",
        },
      }),
    },
    {
      ...createPlainEnv(),
      YNAB_DB: createFailingD1Database(message),
    } as Env,
  );
}

describe("response secret leakage", () => {
  it("does not leak configured secrets in provider auth error bodies", async () => {
    const response = await fetchWorker(
      new Request(MCP_RESOURCE, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/list",
          params: {},
        }),
      }),
      createSecureOAuthEnv(),
    );
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(body).not.toContain(JWT_SIGNING_KEY);
    expect(body).not.toContain(YNAB_ACCESS_TOKEN);
  });

  it("redacts bearer token values from MCP tool error responses", async () => {
    const response = await callUserToolWithFailure(
      `Upstream sent Authorization: Bearer ${YNAB_ACCESS_TOKEN}`,
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain(YNAB_ACCESS_TOKEN);
    expect(body).not.toContain(`Authorization: Bearer ${YNAB_ACCESS_TOKEN}`);
  });

  it("redacts secret-style key assignments from MCP tool error responses", async () => {
    const response = await callUserToolWithFailure(
      `JWT_SIGNING_KEY=${JWT_SIGNING_KEY}`,
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain(JWT_SIGNING_KEY);
    expect(body).not.toContain(`JWT_SIGNING_KEY=${JWT_SIGNING_KEY}`);
  });

  it("does not leak absolute file paths in authorization error responses", async () => {
    const env = createSecureOAuthEnv();
    const { registration } = await registerClient(env, [REDIRECT_URI]);
    const response = await requestAuthorization(env, registration.client_id, {
      scope:
        "mcp /Users/matt/Desktop/Projects/ynab-mcp-build-ci/src/oauth/http/routes.ts",
    });
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).not.toContain(
      "/Users/matt/Desktop/Projects/ynab-mcp-build-ci",
    );
    expect(body).not.toContain("src/oauth/http/routes.ts");
  });
});
