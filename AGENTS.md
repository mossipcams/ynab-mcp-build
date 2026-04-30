# AGENTS.md

## Required first step

Before making code changes, read `architecture.md` to refresh the current module boundaries and Workers-first constraints.

## Repository rules

- Use TDD for implementation work.
- Follow test-first development for any non-trivial code change.
- If the user gives explicit approval to continue until all tasks are finished, do not stop after each task to ask for continuation. Continue task-by-task with TDD, provide progress updates, and report verification at the end.
- The tooling philosophy is test often, fail fast, fix fast.
- Prefer the fast local feedback path first: `pnpm run typecheck:tsgo` for Go-native TypeScript checks and `pnpm run lint:fast` for oxlint.
- Keep stable fallback gates in the shared preflight path, including `pnpm run typecheck:tsc`, ESLint, duplication checks, and tests.
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

# TypeScript Style

Match the patterns in [honojs/hono](https://github.com/honojs/hono). For schemas and validation, match [colinhacks/zod](https://github.com/colinhacks/zod). For ORM/database code, match [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm). Do not add these as dependencies unless the project already uses them. They are style references.

## Types

- Strict mode is required.
- No `any`. No `as` casts without an inline comment explaining why.
- Use `unknown` at trust boundaries (`JSON.parse`, fetch responses, env input). Narrow with a type guard before use.
- Prefer plain `interface` and `type`. Reach for conditional or mapped types only when inference requires it.
- Keep generics narrow. More than two type parameters is a smell.
- Use `as const` objects instead of `enum`.

## Structure

- Named exports only. No default exports.
- No barrel files unless one already exists in that part of the tree.
- Small, composable functions over large classes. Use a class only when state is genuinely instance-scoped.
- One responsibility per file. Split when a file passes ~300 lines.
- Colocate tests with source as `*.test.ts`.

## Errors

- `throw` only for truly exceptional cases.
- Return errors as values when failure is expected (e.g. parse, validate, fetch).
- Never `catch` and swallow. Either handle, rethrow, or log with context.

## Naming

- `camelCase` for variables and functions, `PascalCase` for types and classes, `SCREAMING_SNAKE_CASE` for constants.
- Boolean variables and functions read as questions: `isReady`, `hasAccess`, `canRetry`.
- Avoid abbreviations except for established ones (`id`, `url`, `db`).

## Refactoring

- Preserve the public API unless explicitly told to change it. If a breaking change seems necessary, stop and ask.
- Extract before abstracting. Pull duplicated logic into a function first. Design an interface only after two real call sites with different needs.
- Do not add dependencies during a refactor. If one seems necessary, stop and ask.
- Keep diffs minimal. Do not reformat code that is not part of the change.
- Tests must pass before and after. Run them.
- If tests are missing for the code being refactored, add them first.
- Flag dead code. Do not delete without confirmation.

## Anti-patterns to reject

- Type-system gymnastics where a runtime check would be clearer
- Generic abstractions for code with a single caller
- Comments that restate what the code does
- Hand-rolled validation when a schema library is already in use
- Re-implementing utilities that exist in the standard library or in an existing dependency
- `try`/`catch` blocks that catch and ignore

## Before generating

State your assumptions about runtime (Node, Bun, Workers, Deno), test framework, and module system. Ask if a key constraint is missing instead of guessing.
