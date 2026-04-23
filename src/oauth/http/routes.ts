import type { Hono } from "hono";

import type { AppDependencies } from "../../app/dependencies.js";
import { OAuthConfigurationError, resolveOAuthCore } from "../../app/dependencies.js";
import { resolveAppEnv } from "../../shared/env.js";

function getString(value: FormDataEntryValue | string | null | undefined) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : undefined;
}

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

function writeOAuthConfigurationError(error: unknown) {
  return writeOAuthError(
    "server_error",
    error instanceof Error ? error.message : String(error),
    503
  );
}

function jsonWithCacheControl(payload: unknown) {
  return Response.json(payload, {
    headers: {
      "cache-control": "public, max-age=300"
    }
  });
}

export function registerOAuthHttpRoutes(
  app: Hono<{ Bindings: Env }>,
  dependencies: AppDependencies = {}
) {
  app.get("/.well-known/oauth-authorization-server", (context) => {
    let core;

    try {
      core = resolveOAuthCore(resolveAppEnv(context.env), dependencies);
    } catch (error) {
      if (error instanceof OAuthConfigurationError) {
        return writeOAuthConfigurationError(error);
      }

      throw error;
    }

    if (!core) {
      return context.notFound();
    }

    return jsonWithCacheControl(core.getAuthorizationServerMetadata());
  });

  app.get("/.well-known/openid-configuration", (context) => {
    let core;

    try {
      core = resolveOAuthCore(resolveAppEnv(context.env), dependencies);
    } catch (error) {
      if (error instanceof OAuthConfigurationError) {
        return writeOAuthConfigurationError(error);
      }

      throw error;
    }

    if (!core) {
      return context.notFound();
    }

    return jsonWithCacheControl(core.getOpenIdConfiguration());
  });

  app.get("/.well-known/oauth-protected-resource/mcp", (context) => {
    let core;

    try {
      core = resolveOAuthCore(resolveAppEnv(context.env), dependencies);
    } catch (error) {
      if (error instanceof OAuthConfigurationError) {
        return writeOAuthConfigurationError(error);
      }

      throw error;
    }

    if (!core) {
      return context.notFound();
    }

    return jsonWithCacheControl(core.getProtectedResourceMetadata());
  });

  app.post("/register", async (context) => {
    let core;

    try {
      core = resolveOAuthCore(resolveAppEnv(context.env), dependencies);
    } catch (error) {
      if (error instanceof OAuthConfigurationError) {
        return writeOAuthConfigurationError(error);
      }

      throw error;
    }

    if (!core) {
      return context.notFound();
    }

    try {
      const payload = await context.req.json<{
        client_name?: string;
        grant_types?: unknown;
        redirect_uris?: unknown;
        response_types?: unknown;
        token_endpoint_auth_method?: unknown;
      }>();
      const registration = await core.registerClient({
        clientName: payload.client_name,
        grantTypes: getStringArray(payload.grant_types) ?? [],
        redirectUris: getStringArray(payload.redirect_uris) ?? [],
        responseTypes: getStringArray(payload.response_types) ?? [],
        tokenEndpointAuthMethod:
          typeof payload.token_endpoint_auth_method === "string"
            ? payload.token_endpoint_auth_method
            : ""
      });

      return context.json(registration, 201);
    } catch (error) {
      return writeOAuthError(
        "invalid_client_metadata",
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  app.get("/authorize", async (context) => {
    let core;

    try {
      core = resolveOAuthCore(resolveAppEnv(context.env), dependencies);
    } catch (error) {
      if (error instanceof OAuthConfigurationError) {
        return writeOAuthConfigurationError(error);
      }

      throw error;
    }

    if (!core) {
      return context.notFound();
    }

    try {
      const result = await core.startAuthorization({
        clientId: context.req.query("client_id") ?? "",
        codeChallenge: context.req.query("code_challenge") ?? "",
        codeChallengeMethod: context.req.query("code_challenge_method") ?? "",
        redirectUri: context.req.query("redirect_uri") ?? "",
        ...(context.req.query("resource") ? { resource: context.req.query("resource") } : {}),
        responseType: context.req.query("response_type") ?? "",
        ...(context.req.query("scope") ? { scope: context.req.query("scope") } : {}),
        ...(context.req.query("state") ? { state: context.req.query("state") } : {})
      });

      return context.redirect(result.redirectTo, 302);
    } catch (error) {
      return writeOAuthError("invalid_request", error instanceof Error ? error.message : String(error));
    }
  });

  app.post("/token", async (context) => {
    let core;

    try {
      core = resolveOAuthCore(resolveAppEnv(context.env), dependencies);
    } catch (error) {
      if (error instanceof OAuthConfigurationError) {
        return writeOAuthConfigurationError(error);
      }

      throw error;
    }

    if (!core) {
      return context.notFound();
    }

    const formData = await context.req.formData();
    const grantType = getString(formData.get("grant_type"));
    const clientId = getString(formData.get("client_id")) ?? "";

    try {
      if (grantType === "authorization_code") {
        const tokens = await core.exchangeAuthorizationCode({
          clientId,
          code: getString(formData.get("code")) ?? "",
          codeVerifier: getString(formData.get("code_verifier")) ?? "",
          redirectUri: getString(formData.get("redirect_uri")) ?? "",
          ...(getString(formData.get("resource")) ? { resource: getString(formData.get("resource")) } : {})
        });

        return context.json(tokens);
      }

      if (grantType === "refresh_token") {
        const tokens = await core.refreshAccessToken({
          clientId,
          refreshToken: getString(formData.get("refresh_token")) ?? "",
          ...(getString(formData.get("resource")) ? { resource: getString(formData.get("resource")) } : {})
        });

        return context.json(tokens);
      }

      return writeOAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token.");
    } catch (error) {
      return writeOAuthError("invalid_grant", error instanceof Error ? error.message : String(error));
    }
  });
}
