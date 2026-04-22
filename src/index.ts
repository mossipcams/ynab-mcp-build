import { OAuthStateDO } from "./durable-objects/OAuthStateDO.js";
import { createApp } from "./app/create-app.js";

const app = createApp();

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    return app.fetch(request, env, executionContext);
  }
} satisfies ExportedHandler<Env>;

export { OAuthStateDO };
