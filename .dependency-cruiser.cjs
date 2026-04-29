/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "mcp-sdk-owned-by-mcp-layer",
      severity: "error",
      from: {
        pathNot: "^(src/mcp/|src/http/routes/mcp\\.ts$)",
      },
      to: {
        path: "^@modelcontextprotocol/",
      },
    },
    {
      name: "hono-owned-by-http-and-app-layers",
      severity: "error",
      from: {
        pathNot: "^(src/app/|src/http/|src/oauth/http/)",
      },
      to: {
        path: "^hono$",
      },
    },
    {
      name: "slices-stay-business-logic-only",
      severity: "error",
      from: {
        path: "^src/slices/",
      },
      to: {
        path: "^(src/http/|src/mcp/|src/oauth/|src/durable-objects/|hono$|@modelcontextprotocol/)",
      },
    },
    {
      name: "oauth-core-stays-runtime-agnostic",
      severity: "error",
      from: {
        path: "^src/oauth/core/",
      },
      to: {
        path: "^(src/http/|src/oauth/http/|src/durable-objects/|src/slices/|hono$)",
      },
    },
    {
      name: "durable-objects-avoid-routes-and-slices",
      severity: "error",
      from: {
        path: "^src/durable-objects/",
      },
      to: {
        path: "^(src/http/|src/slices/)",
      },
    },
    {
      name: "ynab-platform-not-used-by-transport-or-protocol",
      severity: "error",
      from: {
        path: "^(src/http/|src/mcp/|src/oauth/|src/durable-objects/)",
      },
      to: {
        path: "^src/platform/ynab/",
      },
    },
    {
      name: "d1-read-model-owned-by-read-model-layer",
      severity: "error",
      from: {
        pathNot: "^(src/app/|src/platform/ynab/read-model/|src/slices/db-)",
      },
      to: {
        path: "^src/platform/ynab/read-model/",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ["node_modules"],
    },
    exclude: {
      path: "\\.spec\\.ts$",
    },
    moduleSystems: ["es6"],
    parser: "tsc",
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
