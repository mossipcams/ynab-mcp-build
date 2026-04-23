import type { Hono } from "hono";

import type { AppDependencies } from "../../app/dependencies.js";
import { registerOAuthHttpRoutes } from "../../oauth/http/routes.js";

export function registerOAuthRoutes(
  app: Hono<{ Bindings: Env }>,
  dependencies: AppDependencies = {}
) {
  registerOAuthHttpRoutes(app, dependencies);
}
