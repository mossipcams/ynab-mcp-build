import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../../index.js";

function createMemoryKvNamespace(): KVNamespace {
  const records = new Map<string, string>();

  return {
    async get(key: string, options?: { type?: string }) {
      const value = records.get(key);

      if (!value) {
        return null;
      }

      return options?.type === "json" ? JSON.parse(value) : value;
    },
    async put(key: string, value: string) {
      records.set(key, value);
    },
    async delete(key: string) {
      records.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const keys = [...records.keys()].filter((name) =>
        options?.prefix ? name.startsWith(options.prefix) : true
      );

      return {
        keys: keys.map((name) => ({ name })),
        list_complete: true
      };
    }
  } as unknown as KVNamespace;
}

function createOAuthEnv(): Env {
  return {
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: "https://mcp.example.com/mcp",
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    OAUTH_KV: createMemoryKvNamespace(),
    YNAB_API_BASE_URL: "https://api.ynab.com/v1"
  } as unknown as Env;
}

function toBase64Url(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}

async function createSignedAccessJwt(payload: Record<string, unknown>) {
  const keyPair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1])
    },
    true,
    ["sign", "verify"]
  );
  const kid = "cf-access-key-1";
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const header = {
    alg: "RS256",
    kid
  };
  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(signingInput)
  );

  return {
    jwks: {
      keys: [
        {
          ...publicJwk,
          alg: "RS256",
          kid,
          use: "sig"
        }
      ]
    },
    token: `${signingInput}.${toBase64Url(new Uint8Array(signature))}`
  };
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
      new Request("https://mcp.example.com/.well-known/oauth-authorization-server"),
      createOAuthEnv(),
      {} as ExecutionContext
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
        "none"
      ]
    });
  });

  it("serves OpenID configuration metadata from the local OAuth server", async () => {
    const response = await worker.fetch(
      new Request("https://mcp.example.com/.well-known/openid-configuration"),
      createOAuthEnv(),
      {} as ExecutionContext
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
        "none"
      ]
    });
  });

  it("serves OpenID configuration metadata from MCP_PUBLIC_URL instead of request origin", async () => {
    const response = await worker.fetch(
      new Request("https://spoof.example.net/.well-known/openid-configuration"),
      createOAuthEnv(),
      {} as ExecutionContext
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      authorization_endpoint: "https://mcp.example.com/authorize",
      issuer: "https://mcp.example.com",
      registration_endpoint: "https://mcp.example.com/register",
      token_endpoint: "https://mcp.example.com/token"
    });
  });

  it("keeps OAuth and OpenID discovery endpoint metadata aligned", async () => {
    const env = createOAuthEnv();
    const oauthResponse = await worker.fetch(
      new Request("https://mcp.example.com/.well-known/oauth-authorization-server"),
      env,
      {} as ExecutionContext
    );
    const openIdResponse = await worker.fetch(
      new Request("https://mcp.example.com/.well-known/openid-configuration"),
      env,
      {} as ExecutionContext
    );
    const oauthMetadata = await oauthResponse.json() as Record<string, unknown>;
    const openIdMetadata = await openIdResponse.json() as Record<string, unknown>;

    expect(openIdResponse.status).toBe(200);
    expect(openIdMetadata).toMatchObject({
      authorization_endpoint: oauthMetadata.authorization_endpoint,
      grant_types_supported: oauthMetadata.grant_types_supported,
      issuer: oauthMetadata.issuer,
      registration_endpoint: oauthMetadata.registration_endpoint,
      response_types_supported: oauthMetadata.response_types_supported,
      scopes_supported: oauthMetadata.scopes_supported,
      token_endpoint: oauthMetadata.token_endpoint,
      token_endpoint_auth_methods_supported: oauthMetadata.token_endpoint_auth_methods_supported
    });
  });

  it("registers a public client with a single redirect URI", async () => {
    const response = await worker.fetch(
      new Request("https://mcp.example.com/register", {
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
      }),
      createOAuthEnv(),
      {} as ExecutionContext
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      client_name: "Claude",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    });
  });

  it("requires authorization-code requests to use S256 PKCE", async () => {
    const env = createOAuthEnv();
    const executionContext = {} as ExecutionContext;
    const registrationResponse = await worker.fetch(
      new Request("https://mcp.example.com/register", {
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
      }),
      env,
      executionContext
    );
    const registration = await registrationResponse.json() as {
      client_id: string;
    };
    const baseParams = new URLSearchParams({
      client_id: registration.client_id,
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      scope: "mcp",
      state: "client-state-1"
    });

    const implicitResponse = await worker.fetch(
      new Request(`https://mcp.example.com/authorize?${new URLSearchParams({
        ...Object.fromEntries(baseParams),
        code_challenge: "0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU",
        code_challenge_method: "S256",
        response_type: "token"
      }).toString()}`),
      env,
      executionContext
    );
    const missingChallengeResponse = await worker.fetch(
      new Request(`https://mcp.example.com/authorize?${new URLSearchParams({
        ...Object.fromEntries(baseParams),
        code_challenge_method: "S256",
        response_type: "code"
      }).toString()}`),
      env,
      executionContext
    );
    const wrongMethodResponse = await worker.fetch(
      new Request(`https://mcp.example.com/authorize?${new URLSearchParams({
        ...Object.fromEntries(baseParams),
        code_challenge: "test-code-verifier",
        code_challenge_method: "plain",
        response_type: "code"
      }).toString()}`),
      env,
      executionContext
    );

    await expect(implicitResponse.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "response_type must be code."
    });
    await expect(missingChallengeResponse.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "code_challenge is required."
    });
    await expect(wrongMethodResponse.json()).resolves.toMatchObject({
      error: "invalid_request",
      error_description: "code_challenge_method must be S256."
    });
    expect(implicitResponse.status).toBe(400);
    expect(missingChallengeResponse.status).toBe(400);
    expect(wrongMethodResponse.status).toBe(400);
  });

  it("requires a valid Cloudflare Access JWT before self-authorizing when Access JWT checks are configured", async () => {
    const env = {
      ...createOAuthEnv(),
      CF_ACCESS_AUD: "access-audience-1",
      CF_ACCESS_TEAM_DOMAIN: "https://access-team.example.com"
    } as Env;
    const executionContext = {} as ExecutionContext;
    const registrationResponse = await worker.fetch(
      new Request("https://mcp.example.com/register", {
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
      }),
      env,
      executionContext
    );
    const registration = await registrationResponse.json() as {
      client_id: string;
    };
    const response = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&scope=mcp&state=client-state-1`
      ),
      env,
      executionContext
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "unauthorized",
      error_description: "Cloudflare Access JWT is required."
    });

    const invalidResponse = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&scope=mcp&state=client-state-1`,
        {
          headers: {
            "cf-access-jwt-assertion": "not-a-jwt"
          }
        }
      ),
      env,
      executionContext
    );

    expect(invalidResponse.status).toBe(401);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      error: "unauthorized",
      error_description: "Cloudflare Access JWT is invalid."
    });
  });

  it("accepts self-authorization when the Cloudflare Access JWT is valid", async () => {
    const env = {
      ...createOAuthEnv(),
      CF_ACCESS_AUD: "access-audience-1",
      CF_ACCESS_TEAM_DOMAIN: "https://access-team.example.com"
    } as Env;
    const { jwks, token } = await createSignedAccessJwt({
      aud: ["access-audience-1"],
      email: "matt@example.com",
      exp: Math.floor(Date.now() / 1000) + 300,
      iss: "https://access-team.example.com",
      sub: "user-1"
    });
    const realFetch = fetch;

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);

      if (request.url === "https://access-team.example.com/cdn-cgi/access/certs") {
        return Response.json(jwks);
      }

      return realFetch(request);
    });

    const executionContext = {} as ExecutionContext;
    const registrationResponse = await worker.fetch(
      new Request("https://mcp.example.com/register", {
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
      }),
      env,
      executionContext
    );
    const registration = await registrationResponse.json() as {
      client_id: string;
    };
    const response = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&scope=mcp&state=client-state-1`,
        {
          headers: {
            "cf-access-jwt-assertion": token
          }
        }
      ),
      env,
      executionContext
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
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/list",
          params: {}
        })
      }),
      env,
      executionContext
    );

    expect(unauthorizedResponse.status).toBe(401);
    expect(unauthorizedResponse.headers.get("www-authenticate")).toContain(
      "resource_metadata=\"https://mcp.example.com/.well-known/oauth-protected-resource/mcp\""
    );

    const registrationResponse = await worker.fetch(
      new Request("https://mcp.example.com/register", {
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
      }),
      env,
      executionContext
    );
    const registration = await registrationResponse.json() as {
      client_id: string;
    };
    const authorizeResponse = await worker.fetch(
      new Request(
        `https://mcp.example.com/authorize?client_id=${encodeURIComponent(registration.client_id)}&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&response_type=code&code_challenge=${encodeURIComponent("0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU")}&code_challenge_method=S256&scope=mcp&state=client-state-1`
      ),
      env,
      executionContext
    );
    const redirectLocation = authorizeResponse.headers.get("location");
    const code = redirectLocation ? new URL(redirectLocation).searchParams.get("code") : null;
    const tokenResponse = await worker.fetch(
      new Request("https://mcp.example.com/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: registration.client_id,
          code: code ?? "",
          code_verifier: "test-code-verifier",
          grant_type: "authorization_code",
          redirect_uri: "https://claude.ai/api/mcp/auth_callback"
        }).toString()
      }),
      env,
      executionContext
    );
    const tokenPayload = await tokenResponse.json() as {
      access_token: string;
    };
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const headers = new Headers(request.headers);

        headers.set("authorization", `Bearer ${tokenPayload.access_token}`);

        return worker.fetch(
          new Request(request, {
            headers
          }),
          env,
          executionContext
        );
      }
    });
    const client = new Client({
      name: "ynab-mcp-build-test-client",
      version: "1.0.0"
    });

    cleanups.push(async () => {
      await transport.close();
      await client.close();
    });

    await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);

    const result = await client.callTool({
      name: "ynab_get_mcp_version",
      arguments: {}
    });
    const content = result.content as Array<{ type: string; text?: string }>;
    const textContent = content.find((entry) => entry.type === "text");

    expect(tokenResponse.status).toBe(200);
    expect(textContent).toBeDefined();
    expect(JSON.parse(textContent!.text!)).toMatchObject({
      name: "ynab-mcp-build",
      version: "0.1.0"
    });
  });
});
