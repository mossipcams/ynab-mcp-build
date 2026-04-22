# Architecture

`ynab-mcp-build` is a Cloudflare Workers-native MCP server built with slice-oriented TypeScript modules.

The product shape for v1 is HTTP streamable MCP first. Everything else exists to support that surface cleanly.

## Runtime Flow

1. `src/index.ts` exports the Worker `fetch` handler.
2. `src/app/create-app.ts` assembles the Hono app, shared dependencies, and route modules.
3. `src/http/routes/**` owns HTTP request parsing, response writing, and route composition only.
4. `src/mcp/**` owns MCP server creation, tool registration, discovery metadata, and MCP transport wiring.
5. `src/slices/**` owns product logic organized by feature slice.
6. `src/platform/ynab/**` owns YNAB HTTP access, mapping, rate limiting, and runtime-safe adapters.
7. `src/oauth/core/**` owns runtime-agnostic OAuth business rules.
8. `src/oauth/http/**` adapts HTTP requests to OAuth core services.
9. `src/durable-objects/**` coordinates short-lived OAuth state that must be strongly consistent.
10. `src/repositories/d1/**` persists optional long-lived metadata such as client registrations and audit records.

## Layer Model

- Entry: `src/index.ts`
- App composition: `src/app/**`
- HTTP transport: `src/http/**`
- MCP protocol: `src/mcp/**`
- OAuth business logic: `src/oauth/core/**`
- OAuth HTTP adapters: `src/oauth/http/**`
- Durable state: `src/durable-objects/**`
- Persistent repositories: `src/repositories/**`
- Platform adapters: `src/platform/**`
- Product slices: `src/slices/**`
- Shared helpers: `src/shared/**`

## Slice Model

Each slice should prefer this layout:

- `index.ts`
- `tools.ts`
- `service.ts`
- `schemas.ts`
- `mappers.ts`

Start simple. If a slice does not need all five files yet, do not create empty placeholders just to satisfy the pattern.

## Boundary Rules

- `src/index.ts` may import only app-composition code.
- `src/http/**` may import `src/mcp/**`, `src/oauth/http/**`, `src/shared/**`, and app-composition helpers.
- `src/http/**` must not contain domain logic, YNAB API calls, or OAuth business rules.
- `src/mcp/**` is the only layer allowed to import `@modelcontextprotocol/*`.
- `src/mcp/**` may register slices, but slice internals must remain MCP-agnostic.
- `src/oauth/core/**` must not import Hono, Durable Object classes, or slice modules.
- `src/oauth/http/**` must remain thin adapters over `src/oauth/core/**`.
- `src/durable-objects/**` must not import Hono routes or slice modules.
- `src/slices/**` must not import Hono, Durable Objects, D1 adapters, or Worker env directly.
- `src/slices/**` may depend on `src/platform/ynab/**` and `src/shared/**`.
- `src/platform/ynab/**` is the only place allowed to call YNAB APIs.
- Shared cross-slice behavior belongs in `src/shared/**` or a deliberate platform adapter, not by reaching into another slice's internals.

## Workers-First Rules

- Production code must use web-standard APIs only: `fetch`, `Request`, `Response`, `URL`, `ReadableStream`, `TransformStream`, `crypto.subtle`.
- Do not introduce Node-only APIs in production code.
- Do not introduce Express, stdio-first abstractions, filesystem reads, or process-based configuration paths in production code.
- Worker bindings and secrets must enter through typed env modules, not ad hoc global access.

## OAuth Persistence Rules

- Durable Objects are the primary store for one-time auth codes, PKCE validation state, replay prevention, and token rotation coordination.
- D1 is optional and reserved for longer-lived metadata such as registered clients and audit history.
- KV is not the primary consistency layer for short-lived OAuth coordination.

## Migration Rules

- The old `src/features/**` modules are the source of truth for reusable domain behavior.
- The old `src/tools/**` compatibility layer should not be recreated in this rebuild.
- Copy only runtime-agnostic helpers and slice logic.
- Rewrite transport, bootstrap, OAuth delivery, and other Node- or Express-shaped code.

## v1 Non-Goals

- Stdio as a first-class transport
- Express compatibility
- Node-specific runtime abstractions
- Filesystem-based package/version discovery at request time
- Recreating legacy compatibility layers before the new Worker-native seams are stable
