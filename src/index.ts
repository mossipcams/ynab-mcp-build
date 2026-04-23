import { OAuthProvider } from "@cloudflare/workers-oauth-provider";

import { McpSessionDO } from "./durable-objects/McpSessionDO.js";
import { createApp } from "./app/create-app.js";
import { resolveAppEnv } from "./shared/env.js";

const app = createApp();

function createOAuthProvider(env: Env) {
  const appEnv = resolveAppEnv(env);
  const baseUrl = appEnv.publicUrl ? new URL("/", appEnv.publicUrl).href : undefined;

  return new OAuthProvider<Env>({
    accessTokenTTL: 60 * 60,
    apiHandlers: {
      "/mcp": app
    },
    authorizeEndpoint: baseUrl ? new URL("/authorize", baseUrl).href : "/authorize",
    clientRegistrationEndpoint: baseUrl ? new URL("/register", baseUrl).href : "/register",
    defaultHandler: app,
    refreshTokenTTL: 30 * 24 * 60 * 60,
    resourceMetadata: appEnv.publicUrl
      ? {
          authorization_servers: [baseUrl ?? new URL("/", appEnv.publicUrl).href],
          resource: appEnv.publicUrl
        }
      : undefined,
    scopesSupported: ["mcp"],
    tokenEndpoint: baseUrl ? new URL("/token", baseUrl).href : "/token"
  });
}

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    const appEnv = resolveAppEnv(env);

    if (!appEnv.oauthEnabled) {
      return app.fetch(request, env, executionContext);
    }

    return createOAuthProvider(env).fetch(request, env, executionContext);
  }
} satisfies ExportedHandler<Env>;

export { McpSessionDO };
