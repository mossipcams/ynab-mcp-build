import { Hono } from "hono";

import type { AppDependencies } from "./dependencies.js";
import { registerMcpRoutes } from "../http/routes/mcp.js";
import { registerOAuthRoutes } from "../http/routes/oauth.js";
import { registerWellKnownRoutes } from "../http/routes/well-known.js";

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono<{ Bindings: Env }>();

  registerWellKnownRoutes(app);
  registerOAuthRoutes(app, dependencies);
  registerMcpRoutes(app, dependencies);

  return app;
}
