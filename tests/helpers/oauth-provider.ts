import worker from "../../src/index.js";

export const MCP_ORIGIN = "https://mcp.example.com";
export const MCP_RESOURCE = `${MCP_ORIGIN}/mcp`;
export const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";
export const CODE_CHALLENGE = "0FLIKahrX7kqxncwhV5WD82lu_wi5GA8FsRSLubaOpU";
export const CODE_VERIFIER = "test-code-verifier";

export interface RegisteredClient {
  client_id: string;
  client_name: string;
  grant_types: string[];
  redirect_uris: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

export function createMemoryKvNamespace(): KVNamespace {
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

export function createOAuthEnv(overrides: Partial<Env> = {}): Env {
  return {
    MCP_OAUTH_ENABLED: "true",
    MCP_PUBLIC_URL: MCP_RESOURCE,
    MCP_SERVER_NAME: "ynab-mcp-build",
    MCP_SERVER_VERSION: "0.1.0",
    OAUTH_KV: createMemoryKvNamespace(),
    YNAB_API_BASE_URL: "https://api.ynab.com/v1",
    YNAB_DB: {} as D1Database,
    YNAB_READ_SOURCE: "d1",
    ...overrides
  } as unknown as Env;
}

export function createExecutionContext() {
  return {} as ExecutionContext;
}

export async function fetchWorker(
  request: Request,
  env: Env,
  executionContext = createExecutionContext()
) {
  return worker.fetch(request, env, executionContext);
}

export function createRegisterRequest(redirectUris = [REDIRECT_URI]) {
  return new Request(`${MCP_ORIGIN}/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_name: "Claude",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: redirectUris,
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    })
  });
}

export async function registerClient(env: Env, redirectUris = [REDIRECT_URI]) {
  const response = await fetchWorker(createRegisterRequest(redirectUris), env);
  const registration = await response.clone().json() as RegisteredClient;

  return { registration, response };
}

export function createAuthorizeUrl(
  clientId: string,
  overrides: Record<string, string | undefined> = {}
) {
  const params = new URLSearchParams({
    client_id: clientId,
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: "S256",
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "mcp",
    state: "client-state-1"
  });

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  return `${MCP_ORIGIN}/authorize?${params.toString()}`;
}

export async function requestAuthorization(
  env: Env,
  clientId: string,
  overrides: Record<string, string | undefined> = {}
) {
  return fetchWorker(new Request(createAuthorizeUrl(clientId, overrides)), env);
}

export async function authorizeClient(
  env: Env,
  clientId: string,
  overrides: Record<string, string | undefined> = {}
) {
  const response = await requestAuthorization(env, clientId, overrides);
  const location = response.headers.get("location");
  const code = location ? new URL(location).searchParams.get("code") : null;

  return { code, location, response };
}

export function createTokenRequest(params: Record<string, string>) {
  return new Request(`${MCP_ORIGIN}/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params).toString()
  });
}

export async function exchangeCode(
  env: Env,
  clientId: string,
  code: string,
  overrides: Record<string, string> = {}
) {
  const response = await fetchWorker(
    createTokenRequest({
      client_id: clientId,
      code,
      code_verifier: CODE_VERIFIER,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      ...overrides
    }),
    env
  );

  return {
    payload: await response.clone().json() as TokenResponse,
    response
  };
}

export async function exchangeRefreshToken(
  env: Env,
  clientId: string,
  refreshToken: string,
  overrides: Record<string, string> = {}
) {
  const response = await fetchWorker(
    createTokenRequest({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      ...overrides
    }),
    env
  );

  return {
    payload: await response.clone().json() as TokenResponse,
    response
  };
}

export async function issueToken(env: Env) {
  const { registration } = await registerClient(env);
  const { code, response: authorizeResponse } = await authorizeClient(env, registration.client_id);

  if (!code) {
    throw new Error(`Authorize did not return a code: ${authorizeResponse.status}`);
  }

  const token = await exchangeCode(env, registration.client_id, code);

  return {
    accessToken: token.payload.access_token,
    registration,
    tokenPayload: token.payload,
    tokenResponse: token.response
  };
}
