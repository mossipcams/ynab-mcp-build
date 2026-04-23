import type { Hono } from "hono";

import { buildDiscoveryDocument } from "../../mcp/discovery.js";
import { resolveAppEnv } from "../../shared/env.js";

export function registerWellKnownRoutes(app: Hono<{ Bindings: Env }>) {
  app.get("/.well-known/mcp.json", (context) => {
    const env = resolveAppEnv(context.env, context.req.raw);
    const document = buildDiscoveryDocument(env);

    return context.json(document);
  });
}
