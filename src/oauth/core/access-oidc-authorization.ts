export const ACCESS_OIDC_CALLBACK_PATH = "/oidc/callback";

const ACCESS_OIDC_SCOPE = "openid email profile";
const PENDING_ACCESS_AUTH_TTL_SECONDS = 5 * 60;
const PENDING_ACCESS_AUTH_PREFIX = "access-oidc:pending:";

export type PendingAccessAuthorization<TRequest> = {
  request: TRequest;
  scope: string[];
};

export type PendingAccessAuthorizationStore = KVNamespace & {
  consume?<T = unknown>(
    key: string,
    options?: { type?: string },
  ): Promise<T | null>;
};

export function getGrantedScopes(requestedScopes: string[]) {
  if (requestedScopes.length === 0) {
    return ["mcp"];
  }

  for (const scope of requestedScopes) {
    if (scope !== "mcp") {
      throw new Error(`Requested scope is not supported: ${scope}`);
    }
  }

  return requestedScopes;
}

export function validateAuthorizationCodePkce(request: Request) {
  const params = new URL(request.url).searchParams;

  if (params.get("response_type") !== "code") {
    throw new Error("response_type must be code.");
  }

  if (!params.get("code_challenge")) {
    throw new Error("code_challenge is required.");
  }

  if (params.get("code_challenge_method") !== "S256") {
    throw new Error("code_challenge_method must be S256.");
  }
}

export function getPublicOrigin(publicUrl: string) {
  return new URL(publicUrl).origin;
}

export function getAccessOidcCallbackUrl(publicUrl: string) {
  return new URL(ACCESS_OIDC_CALLBACK_PATH, getPublicOrigin(publicUrl)).href;
}

function pendingAccessAuthorizationKey(state: string) {
  return `${PENDING_ACCESS_AUTH_PREFIX}${state}`;
}

export async function storePendingAccessAuthorization<TRequest>(
  kv: PendingAccessAuthorizationStore,
  state: string,
  pending: PendingAccessAuthorization<TRequest>,
) {
  await kv.put(pendingAccessAuthorizationKey(state), JSON.stringify(pending), {
    expirationTtl: PENDING_ACCESS_AUTH_TTL_SECONDS,
  });
}

export async function consumePendingAccessAuthorization<TRequest>(
  kv: PendingAccessAuthorizationStore,
  state: string,
) {
  const key = pendingAccessAuthorizationKey(state);
  const pending = kv.consume
    ? await kv.consume<PendingAccessAuthorization<TRequest>>(key, {
        type: "json",
      })
    : await kv.get<PendingAccessAuthorization<TRequest>>(key, {
        type: "json",
      });

  if (!pending) {
    throw new Error(
      "Access OIDC authorization state is invalid or has expired.",
    );
  }

  if (!kv.consume) {
    await kv.delete(key);
  }

  return pending;
}

export function getAccessOidcAuthorizationRedirect(options: {
  authorizationUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(options.authorizationUrl);

  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ACCESS_OIDC_SCOPE);
  url.searchParams.set("state", options.state);

  return url.href;
}

export function getOpenIdConfiguration(publicUrl: string) {
  const origin = getPublicOrigin(publicUrl);

  return {
    authorization_endpoint: `${origin}/authorize`,
    client_id_metadata_document_supported: false,
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    issuer: origin,
    registration_endpoint: `${origin}/register`,
    response_modes_supported: ["query"],
    response_types_supported: ["code"],
    revocation_endpoint: `${origin}/token`,
    scopes_supported: ["mcp"],
    subject_types_supported: ["public"],
    token_endpoint: `${origin}/token`,
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
      "none",
    ],
  };
}
