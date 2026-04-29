# AGENTS.md

## Required first step

Before making code changes, read `architecture.md` to refresh the current module boundaries and Workers-first constraints.

## Repository rules

- Use TDD for implementation work.
- Follow test-first development for any non-trivial code change.
- The tooling philosophy is test often, fail fast, fix fast.
- Prefer the fast local feedback path first: `npm run typecheck:tsgo` for Go-native TypeScript checks and `npm run lint:fast` for oxlint.
- Keep stable fallback gates in the shared preflight path, including `npm run typecheck:tsc`, ESLint, duplication checks, and tests.
- When integrating `@cloudflare/workers-oauth-provider`, test the provider contracts through this MCP server's Worker/app behavior rather than testing or reimplementing the provider internals.
- Keep transport concerns in transport modules only.
- Keep streamable HTTP transport handling in `src/http/**`.
- Keep MCP SDK imports, `registerTool(...)` wiring, server creation, and MCP result formatting in `src/mcp/**` only.
- Keep business logic in slice modules or shared helper modules only.
- Allow slices to expose tool definitions, but do not register tools directly from `src/slices/**`.
- Keep YNAB API access in `src/platform/ynab/**` only.
- Keep OAuth business logic in `src/oauth/core/**` and HTTP adapters in `src/oauth/http/**`.
- Do not add parallel compatibility layers that recreate old Node or Express shapes in the new runtime.
- Prefer web-standard APIs in production code.
- Treat Durable Objects as the canonical coordination layer for short-lived OAuth state.
- If OAuth is enabled, require a Durable Object-backed store or an explicitly injected test store.
- Treat D1 as optional and long-lived metadata only.
