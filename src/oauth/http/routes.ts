import type { Hono } from "hono";

import type { AppDependencies } from "../../app/dependencies.js";
import { resolveAppEnv } from "../../shared/env.js";
import { createOAuthProviderApi } from "./provider.js";

function writeOAuthError(error: string, errorDescription: string, status = 400) {
  return Response.json(
    {
      error,
      error_description: errorDescription
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

export function registerOAuthHttpRoutes(
  app: Hono<{ Bindings: Env }>,
  _dependencies: AppDependencies = {}
) {
  app.get("/authorize", async (context) => {
    const env = resolveAppEnv(context.env);

    if (!env.oauthEnabled) {
      return context.notFound();
    }

    try {
      const oauth = createOAuthProviderApi(context.env);
      const request = await oauth.parseAuthRequest(context.req.raw);
      const result = await oauth.completeAuthorization({
        metadata: {
          clientName: "ynab-mcp-build"
        },
        props: {
          userId: "ynab-mcp-user"
        },
        request,
        scope: getGrantedScopes(request.scope),
        userId: "ynab-mcp-user"
      });

      return context.redirect(result.redirectTo, 302);
    } catch (error) {
      return writeOAuthError("invalid_request", error instanceof Error ? error.message : String(error));
    }
  });
}
