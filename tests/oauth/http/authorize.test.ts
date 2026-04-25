import { afterEach, describe, expect, it, vi } from "vitest";

import {
  authorizeClient,
  createOAuthEnv,
  exchangeCode,
  fetchWorker,
  MCP_ORIGIN,
  REDIRECT_URI,
  registerClient,
  requestAuthorization
} from "../../helpers/oauth-provider.js";

describe("oauth http authorize", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createAccessOidcEnv() {
    return createOAuthEnv({
      ACCESS_CLIENT_ID: "access-client-id",
      ACCESS_CLIENT_SECRET: "access-client-secret",
      ACCESS_TEAM_DOMAIN: "access-team.example.com"
    } as unknown as Partial<Env>);
  }

  function createAccessOidcEnvWithEndpointOverrides() {
    return createOAuthEnv({
      ACCESS_AUTHORIZATION_URL: "https://access.example.com/authorize",
      ACCESS_CLIENT_ID: "access-client-id",
      ACCESS_CLIENT_SECRET: "access-client-secret",
      ACCESS_JWKS_URL: "https://access.example.com/certs",
      ACCESS_TEAM_DOMAIN: "access-team.example.com",
      ACCESS_TOKEN_URL: "https://access.example.com/token"
    } as unknown as Partial<Env>);
  }

  function createAccessDiscoveryResponse() {
    return {
      authorization_endpoint: "https://access-team.example.com/cdn-cgi/access/sso/oidc/authorize",
      jwks_uri: "https://access-team.example.com/cdn-cgi/access/certs",
      token_endpoint: "https://access-team.example.com/cdn-cgi/access/sso/oidc/token"
    };
  }

  function stubAccessDiscoveryFetch() {
    const realFetch = fetch;

    vi.stubGlobal("fetch", vi.fn(async function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      if (this !== undefined) {
        throw new TypeError("Illegal invocation: function called with incorrect `this` reference.");
      }

      const request = input instanceof Request ? input : new Request(input, init);

      if (request.url === "https://access-team.example.com/cdn-cgi/access/sso/oidc/access-client-id/.well-known/openid-configuration") {
        return Response.json(createAccessDiscoveryResponse());
      }

      return realFetch(request);
    }));
  }

  function toBase64Url(input: string | Uint8Array) {
    const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
    let binary = "";

    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
  }

  async function createAccessIdToken(input: {
    audience: string;
    email: string;
    subject: string;
  }) {
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
    const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const kid = "access-key-1";
    const header = {
      alg: "RS256",
      kid,
      typ: "JWT"
    };
    const payload = {
      aud: input.audience,
      email: input.email,
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
      sub: input.subject
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

  it("authorizes a registered MCP client and preserves client state", async () => {
    const env = createOAuthEnv();
    const { registration } = await registerClient(env);
    const { code, location, response } = await authorizeClient(env, registration.client_id);

    expect(response.status).toBe(302);
    expect(location).toContain(`${REDIRECT_URI}?`);
    expect(code).toEqual(expect.any(String));
    expect(code).not.toHaveLength(0);
    expect(location).toContain("state=client-state-1");
  });

  it("redirects authorization requests through Cloudflare Access OIDC when configured", async () => {
    const env = createAccessOidcEnv();
    stubAccessDiscoveryFetch();

    const { registration } = await registerClient(env);
    const response = await requestAuthorization(env, registration.client_id);
    const location = response.headers.get("location");

    expect(response.status).toBe(302);
    expect(location).toBeTruthy();

    const redirect = new URL(location!);

    expect(redirect.origin + redirect.pathname).toBe(
      "https://access-team.example.com/cdn-cgi/access/sso/oidc/authorize"
    );
    expect(redirect.searchParams.get("client_id")).toBe("access-client-id");
    expect(redirect.searchParams.get("redirect_uri")).toBe(`${MCP_ORIGIN}/oidc/callback`);
    expect(redirect.searchParams.get("response_type")).toBe("code");
    expect(redirect.searchParams.get("scope")).toBe("openid email profile");
    expect(redirect.searchParams.get("state")).toEqual(expect.any(String));
    expect(redirect.searchParams.get("state")).not.toHaveLength(0);
  });

  it("uses explicit Access OIDC endpoint overrides without discovery", async () => {
    const env = createAccessOidcEnvWithEndpointOverrides();
    const realFetch = fetch;

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);

      if (request.url.endsWith("/.well-known/openid-configuration")) {
        throw new Error("Discovery should not be requested when endpoint overrides are configured.");
      }

      return realFetch(request);
    }));

    const { registration } = await registerClient(env);
    const response = await requestAuthorization(env, registration.client_id);
    const redirect = new URL(response.headers.get("location")!);

    expect(response.status).toBe(302);
    expect(redirect.origin + redirect.pathname).toBe("https://access.example.com/authorize");
  });

  it("exchanges an Access OIDC callback for a local MCP authorization code", async () => {
    const env = createAccessOidcEnv();
    const { token, jwks } = await createAccessIdToken({
      audience: "access-client-id",
      email: "matt@example.com",
      subject: "github|matt"
    });
    const realFetch = fetch;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);

      if (request.url === "https://access-team.example.com/cdn-cgi/access/sso/oidc/access-client-id/.well-known/openid-configuration") {
        return Response.json(createAccessDiscoveryResponse());
      }

      if (request.url === "https://access-team.example.com/cdn-cgi/access/sso/oidc/token") {
        expect(request.method).toBe("POST");
        expect(request.headers.get("content-type")).toContain("application/x-www-form-urlencoded");
        expect((await request.formData()).get("code")).toBe("access-code-1");

        return Response.json({
          access_token: "access-token-1",
          id_token: token,
          token_type: "Bearer"
        });
      }

      if (request.url === "https://access-team.example.com/cdn-cgi/access/certs") {
        return Response.json(jwks);
      }

      return realFetch(request);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { registration } = await registerClient(env);
    const authorizeResponse = await requestAuthorization(env, registration.client_id);
    const accessRedirect = new URL(authorizeResponse.headers.get("location")!);
    const state = accessRedirect.searchParams.get("state") ?? "";
    const response = await fetchWorker(
      new Request(`${MCP_ORIGIN}/oidc/callback?code=access-code-1&state=${encodeURIComponent(state)}`),
      env
    );
    const location = response.headers.get("location");
    const code = location ? new URL(location).searchParams.get("code") : null;

    expect(response.status).toBe(302);
    expect(location).toContain(`${REDIRECT_URI}?`);
    expect(location).toContain("state=client-state-1");
    expect(code).toEqual(expect.any(String));

    const tokenResponse = await exchangeCode(env, registration.client_id, code ?? "");

    expect(tokenResponse.response.status).toBe(200);
    expect(tokenResponse.payload).toMatchObject({
      scope: "mcp",
      token_type: "bearer"
    });
  });

  it("rejects Access OIDC callbacks without code and state", async () => {
    const response = await fetchWorker(
      new Request(`${MCP_ORIGIN}/oidc/callback`),
      createAccessOidcEnv()
    );
    const payload = await response.json() as { error: string; error_description: string };

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      error: "invalid_request",
      error_description: "Access OIDC callback requires code and state."
    });
  });

  it("rejects Access OIDC callbacks when the upstream token exchange fails", async () => {
    const env = createAccessOidcEnv();
    const realFetch = fetch;
    const requestedUrls: string[] = [];

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);

      requestedUrls.push(request.url);

      if (request.url === "https://access-team.example.com/cdn-cgi/access/sso/oidc/access-client-id/.well-known/openid-configuration") {
        return Response.json(createAccessDiscoveryResponse());
      }

      if (request.url === "https://access-team.example.com/cdn-cgi/access/sso/oidc/token") {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }

      if (request.url === "https://access-team.example.com/cdn-cgi/access/certs") {
        throw new Error("JWKS should not be fetched when token exchange fails.");
      }

      return realFetch(request);
    }));

    const { registration } = await registerClient(env);
    const authorizeResponse = await requestAuthorization(env, registration.client_id);
    const accessRedirect = new URL(authorizeResponse.headers.get("location")!);
    const response = await fetchWorker(
      new Request(`${MCP_ORIGIN}/oidc/callback?code=bad-code&state=${encodeURIComponent(accessRedirect.searchParams.get("state") ?? "")}`),
      env
    );
    const payload = await response.json() as { error: string; error_description: string };

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      error: "invalid_grant",
      error_description: "Access OIDC token exchange failed."
    });
    expect(requestedUrls).toContain("https://access-team.example.com/cdn-cgi/access/sso/oidc/token");
    expect(requestedUrls).not.toContain("https://access-team.example.com/cdn-cgi/access/certs");
  });

  it("rejects replayed Access OIDC callback state", async () => {
    const env = createAccessOidcEnv();
    const { token, jwks } = await createAccessIdToken({
      audience: "access-client-id",
      email: "matt@example.com",
      subject: "github|matt"
    });
    const realFetch = fetch;

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);

      if (request.url === "https://access-team.example.com/cdn-cgi/access/sso/oidc/access-client-id/.well-known/openid-configuration") {
        return Response.json(createAccessDiscoveryResponse());
      }

      if (request.url === "https://access-team.example.com/cdn-cgi/access/sso/oidc/token") {
        return Response.json({
          access_token: "access-token-1",
          id_token: token,
          token_type: "Bearer"
        });
      }

      if (request.url === "https://access-team.example.com/cdn-cgi/access/certs") {
        return Response.json(jwks);
      }

      return realFetch(request);
    }));

    const { registration } = await registerClient(env);
    const authorizeResponse = await requestAuthorization(env, registration.client_id);
    const accessRedirect = new URL(authorizeResponse.headers.get("location")!);
    const callbackUrl = `${MCP_ORIGIN}/oidc/callback?code=access-code-1&state=${encodeURIComponent(accessRedirect.searchParams.get("state") ?? "")}`;

    await fetchWorker(new Request(callbackUrl), env);

    const replayResponse = await fetchWorker(new Request(callbackUrl), env);
    const payload = await replayResponse.json() as { error: string; error_description: string };

    expect(replayResponse.status).toBe(400);
    expect(payload).toMatchObject({
      error: "invalid_grant",
      error_description: "Access OIDC authorization state is invalid or has expired."
    });
  });

  it("rejects scopes that this MCP server does not grant", async () => {
    const env = createOAuthEnv();
    const { registration } = await registerClient(env);
    const response = await requestAuthorization(env, registration.client_id, {
      scope: "mcp admin"
    });
    const payload = await response.json() as { error: string; error_description: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("invalid_request");
    expect(payload.error_description).toBe("Requested scope is not supported: admin");
  });

  it("sanitizes authorization errors before returning them to clients", async () => {
    const env = createOAuthEnv();
    const { registration } = await registerClient(env);
    const response = await requestAuthorization(env, registration.client_id, {
      scope: "mcp /Users/matt/secret"
    });
    const payload = await response.json() as { error: string; error_description: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("invalid_request");
    expect(payload.error_description).toContain("[REDACTED_PATH]");
    expect(payload.error_description).not.toContain("/Users/matt/secret");
  });
});
