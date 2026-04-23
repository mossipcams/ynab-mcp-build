import type { Hono } from "hono";

type OAuthProviderHelpers = {
  completeAuthorization(options: {
    metadata: Record<string, string>;
    props: Record<string, never>;
    request: {
      clientId: string;
      scope: string[];
    };
    scope: string[];
    userId: string;
  }): Promise<{ redirectTo: string }>;
  lookupClient(clientId: string): Promise<unknown | null>;
  parseAuthRequest(request: Request): Promise<{
    clientId: string;
    scope: string[];
  }>;
};

function getOAuthProviderHelpers(env: Env) {
  return (env as Env & { OAUTH_PROVIDER?: OAuthProviderHelpers }).OAUTH_PROVIDER;
}

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

export function registerOAuthHttpRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/authorize", async (context) => {
    const oauthProvider = getOAuthProviderHelpers(context.env);

    if (!oauthProvider) {
      return context.notFound();
    }

    try {
      const request = await oauthProvider.parseAuthRequest(context.req.raw);
      const client = await oauthProvider.lookupClient(request.clientId);

      if (!client) {
        return writeOAuthError("invalid_client", "OAuth client was not found.", 401);
      }

      const result = await oauthProvider.completeAuthorization({
        metadata: {
          client_id: request.clientId
        },
        props: {},
        request,
        scope: request.scope.length > 0 ? request.scope : ["mcp"],
        userId: "ynab-static-user"
      });

      return context.redirect(result.redirectTo, 302);
    } catch (error) {
      return writeOAuthError("invalid_request", error instanceof Error ? error.message : String(error));
    }
  });
}
