import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app/create-app.js";
import {
  createMemoryOAuthStateStorage,
  handleOAuthStateRequest,
} from "../../durable-objects/oauth-state-handler.js";
import worker from "../../index.js";
import { DISCOVERY_TOOL_NAMES } from "../../mcp/discovery.js";

function createMemoryOAuthStateNamespace(): DurableObjectNamespace {
  const storage = createMemoryOAuthStateStorage();

  return {
    idFromName() {
      return {} as DurableObjectId;
    },
    get() {
      return {
        fetch(
          input: Parameters<typeof fetch>[0],
          init?: Parameters<typeof fetch>[1],
        ) {
          const request =
            input instanceof Request ? input : new Request(input, init);

          return handleOAuthStateRequest(storage, request);
        },
      };
    },
  } as unknown as DurableObjectNamespace;
}

function createOAuthEnv(): Env {
  return {
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    OAUTH_STATE: createMemoryOAuthStateNamespace(),
    YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    YNAB_DB: {} as D1Database,
    YNAB_READ_SOURCE: "d1",
  } as unknown as Env;
}

function createMemoryKvNamespace(): KVNamespace {
  const values = new Map<string, string>();

  return {
    async get(key: string) {
      return values.get(key) ?? null;
    },
    async put(key: string, value: string) {
      values.set(key, value);
    },
    async list() {
      return {
        keys: [...values.keys()].map((name) => ({ name })),
        list_complete: true,
      };
    },
  } as unknown as KVNamespace;
}

function createOAuthRouteEnv(): Env {
  return {
    ...createOAuthEnv(),
    OAUTH_KV: createMemoryKvNamespace(),
  } as Env;
}

describe("oauth routes", () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    vi.unstubAllGlobals();

    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("serves OAuth authorization-server metadata when OAuth mode is enabled", async () => {
    const response = await worker.fetch(
      new Request(
        "https://mcp.example.com/.well-known/oauth-authorization-server",
      ),
      createOAuthEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      issuer: "https://mcp.example.com",
      registration_endpoint: "https://mcp.example.com/register",
      response_types_supported: ["code"],
      scopes_supported: ["mcp"],
      token_endpoint: "https://mcp.example.com/token",
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "none",
      ],
    });
  });

  it("serves OpenID configuration metadata from the local OAuth server", async () => {
    const response = await worker.fetch(
      new Request("https://mcp.example.com/.well-known/openid-configuration"),
      createOAuthEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      issuer: "https://mcp.example.com",
      registration_endpoint: "https://mcp.example.com/register",
      response_types_supported: ["code"],
      scopes_supported: ["mcp"],
      subject_types_supported: ["public"],
      token_endpoint: "https://mcp.example.com/token",
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "none",
      ],
    });
  });

  it("serves OpenID configuration metadata from MCP_PUBLIC_URL instead of request origin", async () => {
    const response = await worker.fetch(
      new Request("https://spoof.example.net/.well-known/openid-configuration"),
      createOAuthEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      issuer: "https://mcp.example.com",
      registration_endpoint: "https://mcp.example.com/register",
      token_endpoint: "https://mcp.example.com/token",
    });
  });

  it("keeps OAuth and OpenID discovery endpoint metadata aligned", async () => {
    const env = createOAuthEnv();
    const oauthResponse = await worker.fetch(
      new Request(
        "https://mcp.example.com/.well-known/oauth-authorization-server",
      ),
      env,
      {} as ExecutionContext,
    );
    const openIdResponse = await worker.fetch(
      new Request("https://mcp.example.com/.well-known/openid-configuration"),
      env,
      {} as ExecutionContext,
    );
    const oauthMetadata = (await oauthResponse.json()) as Record<
      string,
      unknown
    >;
    const openIdMetadata = (await openIdResponse.json()) as Record<
      string,
      unknown
    >;

    expect(openIdResponse.status).toBe(200);
    expect(openIdMetadata).toMatchObject({
      authorization_endpoint: oauthMetadata.authorization_endpoint,
      grant_types_supported: oauthMetadata.grant_types_supported,
      issuer: oauthMetadata.issuer,
      registration_endpoint: oauthMetadata.registration_endpoint,
      response_types_supported: oauthMetadata.response_types_supported,
      scopes_supported: oauthMetadata.scopes_supported,
      token_endpoint: oauthMetadata.token_endpoint,
      token_endpoint_auth_methods_supported:
        oauthMetadata.token_endpoint_auth_methods_supported,
    });
  });

  it("registers a public client with a single redirect URI", async () => {
    const response = await worker.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
      createOAuthEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      client_name: "Claude",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it("rejects untrusted dynamic client registration metadata in the local route", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_name: "Unexpected client",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://evil.example.com/callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
      createOAuthRouteEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_client_metadata",
      error_description: "redirect_uris contains an untrusted redirect URI.",
    });
  });

  it("registers trusted dynamic client metadata in the local route", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
      createOAuthRouteEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      client_name: "Claude",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it("rejects invalid JSON dynamic client registration payloads in the local route", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{",
      }),
      createOAuthRouteEnv(),
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_client_metadata",
    });
  });

  it("keeps local registration method handling client-compatible", async () => {
    const app = createApp();
    const env = createOAuthRouteEnv();
    const optionsResponse = await app.fetch(
      new Request("https://mcp.example.com/register", {
        method: "OPTIONS",
      }),
      env,
      {} as ExecutionContext,
    );
    const getResponse = await app.fetch(
      new Request("https://mcp.example.com/register"),
      env,
      {} as ExecutionContext,
    );

    expect(optionsResponse.status).toBe(204);
    expect(optionsResponse.headers.get("allow")).toBe("POST, OPTIONS");
    expect(getResponse.status).toBe(404);
  });

  it("requires authorization-code requests to use S256 PKCE", async () => {
    const env = createOAuthEnv();
    const executionContext = {} as ExecutionContext;
    const registrationResponse = await worker.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
      env,
      executionContext,
    );
    const registration = (await registrationResponse.json()) as {
      client_id: string;
    };
    const baseParams = new URLSearchParams({
      client_id: registration.client_id,
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      scope: "mcp",
      state: "client-state-1",
    });

    const implicitResponse = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?${new URLSearchParams({
          ...Object.fromEntries(baseParams),
          code_challenge: "0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU",
          code_challenge_method: "S256",
          response_type: "token",
        }).toString()}`,
      ),
      env,
      executionContext,
    );
    const missingChallengeResponse = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?${new URLSearchParams({
          ...Object.fromEntries(baseParams),
          code_challenge_method: "S256",
          response_type: "code",
        }).toString()}`,
      ),
      env,
      executionContext,
    );
    const wrongMethodResponse = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?${new URLSearchParams({
          ...Object.fromEntries(baseParams),
          code_challenge: "test-code-verifier",
          code_challenge_method: "plain",
          response_type: "code",
        }).toString()}`,
      ),
      env,
      executionContext,
    );

    await expect(implicitResponse.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "response_type must be code.",
    });
    await expect(missingChallengeResponse.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "code_challenge is required.",
    });
    await expect(wrongMethodResponse.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "code_challenge_method must be S256.",
    });
    expect(implicitResponse.status).toBe(400);
    expect(missingChallengeResponse.status).toBe(400);
    expect(wrongMethodResponse.status).toBe(400);
  });

  it("ignores legacy Cloudflare Access JWT assertion settings when self-authorizing", async () => {
    const env = {
      ...createOAuthEnv(),
      CF_ACCESS_AUD: "access-audience-1",
      CF_ACCESS_TEAM_DOMAIN: "https://access-team.example.com",
    } as Env;
    const executionContext = {} as ExecutionContext;
    const registrationResponse = await worker.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
      env,
      executionContext,
    );
    const registration = (await registrationResponse.json()) as {
      client_id: string;
    };
    const response = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&scope=mcp&state=client-state-1`,
      ),
      env,
      executionContext,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("state=client-state-1");
  });

  it("requires OAuth access tokens for MCP when OAuth mode is enabled", async () => {
    const env = createOAuthEnv();
    const executionContext = {} as ExecutionContext;
    const unauthorizedResponse = await worker.fetch(
      new Request("https://mcp.example.com/mcp", {
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
      env,
      executionContext,
    );

    expect(unauthorizedResponse.status).toBe(401);
    expect(unauthorizedResponse.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
    );

    const registrationResponse = await worker.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
      env,
      executionContext,
    );
    const registration = (await registrationResponse.json()) as {
      client_id: string;
    };
    const authorizeResponse = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&scope=mcp&state=client-state-1`,
      ),
      env,
      executionContext,
    );
    const redirectLocation = authorizeResponse.headers.get("location");
    const code = redirectLocation
      ? new URL(redirectLocation).searchParams.get("code")
      : null;
    const tokenResponse = await worker.fetch(
      new Request("https://mcp.example.com/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code: code ?? "",
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
        }).toString(),
      }),
      env,
      executionContext,
    );
    const tokenPayload = (await tokenResponse.json()) as {
      access_token: string;
      resource?: string;
    };
    const transport = new StreamableHTTPClientTransport(
      new URL("https://mcp.example.com/mcp"),
      {
        fetch: async (input, init) => {
          const request =
            input instanceof Request ? input : new Request(input, init);
          const headers = new Headers(request.headers);

          headers.set("authorization", `Bearer ${tokenPayload.access_token}`);

          return worker.fetch(
            new Request(request, {
              headers,
            }),
            env,
            executionContext,
          );
        },
      },
    );
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0",
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(
      transport as unknown as Parameters<typeof client.connect>[0],
    );

    const result = await client.listTools();

    expect(tokenResponse.status).toBe(200);
    expect(tokenPayload.resource).toBe("https://mcp.example.com/mcp");
    expect(result.tools.map((tool) => tool.name).sort()).toEqual(
      [...DISCOVERY_TOOL_NAMES].sort(),
    );
    expect(result.tools).toHaveLength(27);
    for (const tool of result.tools) {
      expect(tool.annotations).toMatchObject({
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      });
    }
  });

  it("rejects provider tokens bound to a different resource for MCP", async () => {
    const env = createOAuthEnv();
    const executionContext = {} as ExecutionContext;
    const registrationResponse = await worker.fetch(
      new Request("https://mcp.example.com/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          client_name: "Claude",
          grant_types: ["authorization_code", "refresh_token"],
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
      env,
      executionContext,
    );
    const registration = (await registrationResponse.json()) as {
      client_id: string;
    };
    const authorizeResponse = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&scope=mcp&state=client-state-1&resource=${encodeURIComponent("https://other.example.com/mcp")}`,
      ),
      env,
      executionContext,
    );
    const redirectLocation = authorizeResponse.headers.get("location");
    const code = redirectLocation
      ? new URL(redirectLocation).searchParams.get("code")
      : null;
    const tokenResponse = await worker.fetch(
      new Request("https://mcp.example.com/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code: code ?? "",
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
        }).toString(),
      }),
      env,
      executionContext,
    );
    const tokenPayload = (await tokenResponse.json()) as {
      access_token: string;
      resource?: string;
    };
    const mcpResponse = await worker.fetch(
      new Request("https://mcp.example.com/mcp", {
        method: "POST",
        headers: {
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${tokenPayload.access_token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/list",
          params: {},
        }),
      }),
      env,
      executionContext,
    );

    expect(authorizeResponse.status).toBe(302);
    expect(tokenResponse.status).toBe(200);
    expect(tokenPayload.resource).toBe("https://other.example.com/mcp");
    expect(mcpResponse.status).toBe(401);
    await expect(mcpResponse.json()).resolves.toMatchObject({
      error: "invalid_token",
      error_description: "Token audience does not match resource server",
    });
  });
});
