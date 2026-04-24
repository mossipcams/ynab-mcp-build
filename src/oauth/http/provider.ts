import {
  getOAuthApi,
  OAuthProvider,
  type OAuthProviderOptions
} from "@cloudflare/workers-oauth-provider";

type HandlerWithFetch = ExportedHandler<Env> & Pick<Required<ExportedHandler<Env>>, "fetch">;

const noopHandler = {
  fetch() {
    return new Response(null, { status: 404 });
  }
} satisfies HandlerWithFetch;

function createOAuthProviderOptions(apiHandler: HandlerWithFetch): OAuthProviderOptions<Env> {
  return {
    apiHandler: apiHandler as ExportedHandler<Env> & Pick<Required<ExportedHandler<Env>>, "fetch">,
    apiRoute: "/mcp",
    authorizeEndpoint: "/authorize",
    clientRegistrationEndpoint: "/register",
    defaultHandler: apiHandler,
    allowPlainPKCE: false,
    scopesSupported: ["mcp"],
    tokenEndpoint: "/token"
  };
}

export function createOAuthProvider(apiHandler: ExportedHandler<Env>) {
  return new OAuthProvider<Env>(createOAuthProviderOptions(apiHandler as HandlerWithFetch));
}

export function createOAuthProviderApi(env: Env) {
  return getOAuthApi(createOAuthProviderOptions(noopHandler), env);
}
