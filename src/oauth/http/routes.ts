import type { Hono } from "hono";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

import type { AppDependencies } from "../../app/dependencies.js";
import { resolveAppEnv } from "../../shared/env.js";
import { createAccessOidcClient } from "./access-oidc.js";
import { createOAuthProviderApi } from "./provider.js";

const ACCESS_OIDC_CALLBACK_PATH = "/oidc/callback";
const ACCESS_OIDC_SCOPE = "openid email profile";
const PENDING_ACCESS_AUTH_TTL_SECONDS = 5 * 60;
const PENDING_ACCESS_AUTH_PREFIX = "access-oidc:pending:";

type PendingAccessAuthorization = {
  request: AuthRequest;
  scope: string[];
};

function sanitizeOAuthErrorDescription(errorDescription: string) {
  return errorDescription
    .split(/\r?\n/u)[0]
    .replace(/\/Users\/[^\s"]+/gu, "[REDACTED_PATH]")
    .replace(/[A-Za-z]:\\[^\s"]+/gu, "[REDACTED_PATH]");
}

function writeOAuthError(error: string, errorDescription: string, status = 400) {
  return Response.json(
    {
      error,
      error_description: sanitizeOAuthErrorDescription(errorDescription)
    },
    {
      status
    }
  );
}

function getGrantedScopes(requestedScopes: string[]) {
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

function validateAuthorizationCodePkce(request: Request) {
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

function getPublicOrigin(publicUrl: string) {
  return new URL(publicUrl).origin;
}

function getAccessOidcCallbackUrl(publicUrl: string) {
  return new URL(ACCESS_OIDC_CALLBACK_PATH, getPublicOrigin(publicUrl)).href;
}

function pendingAccessAuthorizationKey(state: string) {
  return `${PENDING_ACCESS_AUTH_PREFIX}${state}`;
}

async function storePendingAccessAuthorization(
  kv: KVNamespace,
  state: string,
  pending: PendingAccessAuthorization
) {
  await kv.put(pendingAccessAuthorizationKey(state), JSON.stringify(pending), {
    expirationTtl: PENDING_ACCESS_AUTH_TTL_SECONDS
  });
}

async function consumePendingAccessAuthorization(kv: KVNamespace, state: string) {
  const key = pendingAccessAuthorizationKey(state);
  const pending = await kv.get<PendingAccessAuthorization>(key, {
    type: "json"
  });

  if (!pending) {
    throw new Error("Access OIDC authorization state is invalid or has expired.");
  }

  await kv.delete(key);

  return pending;
}

function getAccessOidcAuthorizationRedirect(options: {
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

export function registerOAuthHttpRoutes(
  app: Hono<{ Bindings: Env }>,
  _dependencies: AppDependencies = {}
) {
  app.get("/authorize", async (context) => {
    const env = resolveAppEnv(context.env, context.req.raw);

    if (!env.oauthEnabled) {
      return context.notFound();
    }

    try {
      validateAuthorizationCodePkce(context.req.raw);

      const oauth = createOAuthProviderApi(context.env);
      const request = await oauth.parseAuthRequest(context.req.raw);
      const scope = getGrantedScopes(request.scope);

      if (env.accessOidc) {
        const state = crypto.randomUUID();
        const kv = env.oauthKvNamespace ?? (context.env as { OAUTH_KV?: KVNamespace }).OAUTH_KV;

        if (!kv) {
          throw new Error("OAuth KV storage is required for Access OIDC authorization.");
        }

        await storePendingAccessAuthorization(kv, state, {
          request,
          scope
        });

        return context.redirect(
          getAccessOidcAuthorizationRedirect({
            authorizationUrl: env.accessOidc.authorizationUrl,
            clientId: env.accessOidc.clientId,
            redirectUri: getAccessOidcCallbackUrl(env.publicUrl!),
            state
          }),
          302
        );
      }

      const result = await oauth.completeAuthorization({
        metadata: {
          clientName: "ynab-mcp-build"
        },
        props: {
          userId: "ynab-mcp-user"
        },
        request,
        scope,
        userId: "ynab-mcp-user"
      });

      return context.redirect(result.redirectTo, 302);
    } catch (error) {
      return writeOAuthError("invalid_request", error instanceof Error ? error.message : String(error));
    }
  });

  app.get(ACCESS_OIDC_CALLBACK_PATH, async (context) => {
    const env = resolveAppEnv(context.env, context.req.raw);

    if (!env.oauthEnabled || !env.accessOidc) {
      return context.notFound();
    }

    const code = context.req.query("code");
    const state = context.req.query("state");

    if (!code || !state) {
      return writeOAuthError("invalid_request", "Access OIDC callback requires code and state.");
    }

    try {
      const kv = env.oauthKvNamespace ?? (context.env as { OAUTH_KV?: KVNamespace }).OAUTH_KV;

      if (!kv) {
        throw new Error("OAuth KV storage is required for Access OIDC authorization.");
      }

      const pending = await consumePendingAccessAuthorization(kv, state);
      const identity = await createAccessOidcClient({
        clientId: env.accessOidc.clientId,
        clientSecret: env.accessOidc.clientSecret,
        fetch,
        jwksUrl: env.accessOidc.jwksUrl,
        redirectUri: getAccessOidcCallbackUrl(env.publicUrl!),
        tokenUrl: env.accessOidc.tokenUrl
      }).authenticate(code);
      const userId = identity.email ?? identity.sub;
      const result = await createOAuthProviderApi(context.env).completeAuthorization({
        metadata: {
          clientName: "ynab-mcp-build",
          upstream: "cloudflare-access"
        },
        props: {
          email: identity.email,
          sub: identity.sub,
          userId
        },
        request: pending.request,
        scope: pending.scope,
        userId
      });

      return context.redirect(result.redirectTo, 302);
    } catch (error) {
      return writeOAuthError("invalid_grant", error instanceof Error ? error.message : String(error));
    }
  });
}
