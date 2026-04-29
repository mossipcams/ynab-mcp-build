import {
  getOAuthApi,
  OAuthProvider,
  type OAuthProviderOptions
} from "@cloudflare/workers-oauth-provider";

type HandlerWithFetch = ExportedHandler<Env> & Pick<Required<ExportedHandler<Env>>, "fetch">;
type OAuthExecutionContext = ExecutionContext & {
  props?: {
    scopes?: string[];
  };
};

const noopHandler = {
  fetch() {
    return new Response(null, { status: 404 });
  }
} satisfies HandlerWithFetch;

function writeInsufficientScope() {
  return Response.json(
    {
      error: "insufficient_scope",
      error_description: "Bearer token does not grant the mcp scope."
    },
    {
      headers: {
        "www-authenticate": 'Bearer realm="OAuth", error="insufficient_scope"'
      },
      status: 403
    }
  );
}

function createScopedApiHandler(apiHandler: HandlerWithFetch) {
  return {
    fetch(request, env, executionContext) {
      if (!(executionContext as OAuthExecutionContext).props?.scopes?.includes("mcp")) {
        return writeInsufficientScope();
      }

      return apiHandler.fetch(request, env, executionContext);
    }
  } satisfies HandlerWithFetch;
}

function readTokenExchangeProps(props: unknown) {
  return typeof props === "object" && props !== null ? props : {};
}

function createOAuthProviderOptions(apiHandler: HandlerWithFetch): OAuthProviderOptions<Env> {
  const scopedApiHandler = createScopedApiHandler(apiHandler);

  return {
    apiHandler: scopedApiHandler,
    apiRoute: "/mcp",
    authorizeEndpoint: "/authorize",
    clientRegistrationEndpoint: "/register",
    defaultHandler: apiHandler,
    allowPlainPKCE: false,
    scopesSupported: ["mcp"],
    tokenExchangeCallback(options) {
      const props = readTokenExchangeProps(options.props);

      return {
        accessTokenProps: {
          ...props,
          scopes: options.requestedScope
        }
      };
    },
    tokenEndpoint: "/token"
  };
}

export function createOAuthProvider(apiHandler: ExportedHandler<Env>) {
  return new OAuthProvider<Env>(createOAuthProviderOptions(apiHandler as HandlerWithFetch));
}

export function createOAuthProviderApi(env: Env) {
  return getOAuthApi(createOAuthProviderOptions(noopHandler), env);
}
