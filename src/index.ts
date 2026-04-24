import { createApp } from "./app/create-app.js";
import { createOAuthProvider } from "./oauth/http/provider.js";
import { resolveAppEnv } from "./shared/env.js";

const app = createApp();
const appHandler = {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    return app.fetch(request, env, executionContext);
  }
} satisfies ExportedHandler<Env>;
const oauthProvider = createOAuthProvider(appHandler);

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    if (resolveAppEnv(env).oauthEnabled) {
      return oauthProvider.fetch(request, env, executionContext);
    }

    return appHandler.fetch(request, env, executionContext);
  }
} satisfies ExportedHandler<Env>;
