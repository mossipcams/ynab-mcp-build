import { OAuthStateDO } from "./durable-objects/OAuthStateDO.js";
import { createDurableObjectOAuthKvNamespace } from "./durable-objects/oauth-state-client.js";
import { createApp } from "./app/create-app.js";
import { runScheduledReadModelSyncAndReport } from "./app/scheduled-sync.js";
import { createOAuthProvider } from "./oauth/http/provider.js";
import { type AppEnv, resolveAppEnv } from "./shared/env.js";

const app = createApp();
const appHandler = {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    return app.fetch(request, env, executionContext);
  },
} satisfies ExportedHandler<Env>;
const oauthProvider = createOAuthProvider(appHandler);

function createOAuthProviderEnv(env: Env, appEnv: AppEnv) {
  if (appEnv.oauthKvNamespace) {
    return env;
  }

  const oauthStateNamespace = appEnv.oauthStateNamespace!;
  const oauthState = oauthStateNamespace.get(
    oauthStateNamespace.idFromName("oauth-state"),
  );

  return {
    ...env,
    OAUTH_KV: createDurableObjectOAuthKvNamespace(oauthState),
  } as Env;
}

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    const appEnv = resolveAppEnv(env, request);

    if (appEnv.oauthEnabled) {
      return oauthProvider.fetch(
        request,
        createOAuthProviderEnv(env, appEnv),
        executionContext,
      );
    }

    return appHandler.fetch(request, env, executionContext);
  },
  scheduled(
    controller: ScheduledController,
    env: Env,
    executionContext: ExecutionContext,
  ) {
    executionContext.waitUntil(
      runScheduledReadModelSyncAndReport(
        env,
        controller.scheduledTime,
        {},
        {
          cron: controller.cron,
        },
      ),
    );
  },
} satisfies ExportedHandler<Env>;

export { OAuthStateDO };
