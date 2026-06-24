import type { Hono } from "hono";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

import type { AppDependencies } from "../../app/dependencies.js";
import {
  ACCESS_OIDC_CALLBACK_PATH,
  bindAuthorizationRequestResource,
  consumePendingAccessAuthorization,
  getAccessOidcAuthorizationRedirect,
  getAccessOidcCallbackUrl,
  getGrantedScopes,
  getOpenIdConfiguration,
  storePendingAccessAuthorization,
  validateAuthorizationCodePkce,
} from "../core/access-oidc-authorization.js";
import { validateClientRegistrationMetadata } from "../core/client-registration-policy.js";
import { resolveAppEnv } from "../../shared/env.js";
import {
  createAccessOidcClient,
  resolveAccessOidcEndpoints,
} from "./access-oidc.js";
import { createOAuthProviderApi } from "./provider.js";

function sanitizeOAuthErrorDescription(errorDescription: string) {
  const firstLine = errorDescription.split(/\r?\n/u)[0] ?? "";

  return firstLine
    .replace(/\/Users\/[^\s"]+/gu, "[REDACTED_PATH]")
    .replace(/[A-Za-z]:\\[^\s"]+/gu, "[REDACTED_PATH]");
}

function writeOAuthError(
  error: string,
  errorDescription: string,
  status = 400,
) {
  return Response.json(
    {
      error,
      error_description: sanitizeOAuthErrorDescription(errorDescription),
    },
    {
      status,
    },
  );
}

const accessOidcFetch: typeof fetch = (input, init) => fetch(input, init);

async function readJsonPayload(request: Request): Promise<unknown> {
  return request.json();
}

export function registerOAuthHttpRoutes(
  app: Hono<{ Bindings: Env }>,
  _dependencies: AppDependencies = {},
) {
  app.options("/register", (context) => {
    const env = resolveAppEnv(context.env, context.req.raw);

    if (!env.oauthEnabled) {
      return context.notFound();
    }

    return new Response(null, {
      headers: {
        allow: "POST, OPTIONS",
      },
      status: 204,
    });
  });

  app.post("/register", async (context) => {
    const env = resolveAppEnv(context.env, context.req.raw);

    if (!env.oauthEnabled) {
      return context.notFound();
    }

    try {
      const policy = validateClientRegistrationMetadata(
        await readJsonPayload(context.req.raw),
      );

      if (!policy.accepted) {
        return writeOAuthError(policy.error, policy.errorDescription, 400);
      }

      const client = await createOAuthProviderApi(context.env).createClient({
        ...(policy.metadata.client_name
          ? { clientName: policy.metadata.client_name }
          : {}),
        grantTypes: policy.metadata.grant_types,
        redirectUris: policy.metadata.redirect_uris,
        responseTypes: policy.metadata.response_types,
        tokenEndpointAuthMethod: policy.metadata.token_endpoint_auth_method,
      });

      return context.json(
        {
          client_id: client.clientId,
          ...(client.clientName ? { client_name: client.clientName } : {}),
          grant_types: client.grantTypes,
          redirect_uris: client.redirectUris,
          response_types: client.responseTypes,
          token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        },
        201,
      );
    } catch (error) {
      return writeOAuthError(
        "invalid_client_metadata",
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  app.get("/.well-known/openid-configuration", (context) => {
    const env = resolveAppEnv(context.env, context.req.raw);

    if (!env.oauthEnabled) {
      return context.notFound();
    }

    return context.json(getOpenIdConfiguration(env.publicUrl!));
  });

  app.get("/authorize", async (context) => {
    const env = resolveAppEnv(context.env, context.req.raw);

    if (!env.oauthEnabled) {
      return context.notFound();
    }

    try {
      validateAuthorizationCodePkce(context.req.raw);

      const oauth = createOAuthProviderApi(context.env);
      const request = await oauth.parseAuthRequest(context.req.raw);
      const resourceBoundRequest = bindAuthorizationRequestResource(
        request,
        env.publicUrl!,
      );
      const scope = getGrantedScopes(request.scope);

      if (env.accessOidc) {
        const state = crypto.randomUUID();
        const kv = env.oauthKvNamespace;
        const accessEndpoints = await resolveAccessOidcEndpoints({
          config: env.accessOidc,
          fetch: accessOidcFetch,
        });

        if (!kv) {
          throw new Error(
            "OAuth KV storage is required for Access OIDC authorization.",
          );
        }

        await storePendingAccessAuthorization(kv, state, {
          request: resourceBoundRequest,
          scope,
        });

        return context.redirect(
          getAccessOidcAuthorizationRedirect({
            authorizationUrl: accessEndpoints.authorizationUrl,
            clientId: env.accessOidc.clientId,
            redirectUri: getAccessOidcCallbackUrl(env.publicUrl!),
            state,
          }),
          302,
        );
      }

      const result = await oauth.completeAuthorization({
        metadata: {
          clientName: "ynab-mcp-build",
        },
        props: {
          userId: "ynab-mcp-user",
        },
        request: resourceBoundRequest,
        scope,
        userId: "ynab-mcp-user",
      });

      return context.redirect(result.redirectTo, 302);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return writeOAuthError("invalid_request", message, 400);
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
      return writeOAuthError(
        "invalid_request",
        "Access OIDC callback requires code and state.",
      );
    }

    try {
      const kv = env.oauthKvNamespace;
      const accessEndpoints = await resolveAccessOidcEndpoints({
        config: env.accessOidc,
        fetch: accessOidcFetch,
      });

      if (!kv) {
        throw new Error(
          "OAuth KV storage is required for Access OIDC authorization.",
        );
      }

      const pending = await consumePendingAccessAuthorization<AuthRequest>(
        kv,
        state,
      );
      const identity = await createAccessOidcClient({
        clientId: env.accessOidc.clientId,
        clientSecret: env.accessOidc.clientSecret,
        ...(accessEndpoints.issuer
          ? { expectedIssuer: accessEndpoints.issuer }
          : {}),
        fetch: accessOidcFetch,
        jwksUrl: accessEndpoints.jwksUrl,
        redirectUri: getAccessOidcCallbackUrl(env.publicUrl!),
        tokenUrl: accessEndpoints.tokenUrl,
      }).authenticate(code);
      const userId = identity.email ?? identity.sub;
      const result = await createOAuthProviderApi(
        context.env,
      ).completeAuthorization({
        metadata: {
          clientName: "ynab-mcp-build",
          upstream: "cloudflare-access",
        },
        props: {
          email: identity.email,
          sub: identity.sub,
          userId,
        },
        request: pending.request,
        scope: pending.scope,
        userId,
      });

      return context.redirect(result.redirectTo, 302);
    } catch (error) {
      return writeOAuthError(
        "invalid_grant",
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}
