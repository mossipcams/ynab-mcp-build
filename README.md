# ynab-mcp-build

Cloudflare Workers-native MCP server for YNAB. It exposes YNAB budget data to
MCP clients through streamable HTTP, with normal tool reads served from a
Cloudflare D1 read model.

## Overview

This repository is a TypeScript-first Workers rebuild of `ynab-mcp-bridge`.
The current product surface is an HTTP MCP server:

- Worker entry point: `src/index.ts`
- MCP endpoint: `ALL /mcp`
- Discovery document: `GET /.well-known/mcp.json`
- OAuth routes: `GET /.well-known/openid-configuration`, `GET /authorize`,
  `GET /oidc/callback`
- Scheduled sync: hourly Wrangler cron, `0 * * * *`

The server is intentionally Worker-native. Production code should stay on
web-standard APIs and avoid Node-only runtime assumptions, Express compatibility
layers, and filesystem-based request-time configuration.

## Runtime Model

```text
YNAB API
  -> scheduled sync
  -> Cloudflare D1 read model
  -> slice services
  -> MCP tool responses
```

Normal MCP tools read from D1. They do not silently fall back to direct YNAB API
requests. YNAB API calls belong to sync/admin paths, where the Worker refreshes
the read model.

OAuth state is separate from budget data. When OAuth is enabled, the Worker uses
the configured Durable Object namespace as the backing store for short-lived
OAuth coordination.

For the deeper import boundaries, read [architecture.md](architecture.md).

## Tool Surface

The discovery document advertises 48 YNAB tools. The registered tools cover:

- metadata: server version and authenticated YNAB user
- plans, plan settings, months, categories, and month categories
- accounts
- payees and payee locations
- transactions and transaction search
- scheduled transactions
- money movements and money movement groups
- financial summaries, including monthly review, cash flow, spending,
  emergency fund coverage, debt, goals, anomalies, and cleanup checks

All advertised normal MCP tools are registered in D1 mode.

Most plan-scoped tools accept an optional `planId`. Omit it when
`YNAB_DEFAULT_PLAN_ID` is configured or when the synced read model can identify a
known default plan. If neither is true, plan-scoped tools return a clear
`planId` error instead of guessing.

Read tools include freshness metadata for the read-model endpoints they depend
on. If an endpoint has never synced or is unhealthy, the tool returns an
actionable sync response instead of returning stale-looking data.

## Architecture

The source is organized around explicit runtime seams:

- `src/http/**`: Hono routes and HTTP transport concerns
- `src/mcp/**`: MCP SDK imports, server creation, registration, discovery, and
  MCP result formatting
- `src/slices/**`: product logic and tool definitions
- `src/platform/ynab/**`: YNAB API clients and D1 read-model repositories
- `src/oauth/core/**`: runtime-agnostic OAuth rules
- `src/oauth/http/**`: HTTP adapters for OAuth
- `src/durable-objects/**`: Durable Object-backed OAuth state coordination
- `src/shared/**`: runtime-agnostic helpers

`src/slices/**` can expose tool definitions, but registration happens from the
MCP/app layer. DB-backed slices use the public `ynab_*` tool names while reading
through read-model repositories.

## Requirements

- Corepack
- pnpm `10.33.2`
- Wrangler auth for Cloudflare commands
- Cloudflare D1 database bound as `YNAB_DB`
- Durable Object binding named `OAUTH_STATE` when OAuth is enabled
- YNAB personal access token or equivalent token secret for scheduled sync

## Local Development

Install dependencies:

```sh
corepack enable
pnpm install
```

Generate Worker types after changing `wrangler.jsonc`:

```sh
pnpm run typegen
```

Run the Worker locally:

```sh
pnpm run dev
```

Wrangler usually serves the local Worker at:

```text
http://localhost:8787
```

The MCP endpoint is:

```text
http://localhost:8787/mcp
```

Fast feedback:

```sh
pnpm run typecheck:tsgo
pnpm run lint:fast
pnpm test
```

Stable gates:

```sh
pnpm run typecheck
pnpm run format:check
pnpm run check:cf
```

Full pre-PR gate:

```sh
pnpm run check:pr
```

## Configuration

`wrangler.jsonc` currently defines:

```text
MCP_OAUTH_ENABLED=true
MCP_SERVER_NAME=ynab-mcp-build
MCP_SERVER_VERSION=0.1.0
YNAB_API_BASE_URL=https://api.ynab.com/v1
YNAB_READ_SOURCE=d1
YNAB_STALE_AFTER_MINUTES=360
YNAB_DB
OAUTH_STATE
```

Required production secrets in the current Wrangler config:

```text
ACCESS_CLIENT_ID
ACCESS_CLIENT_SECRET
ACCESS_TEAM_DOMAIN
YNAB_ACCESS_TOKEN
```

Important environment behavior:

- `YNAB_READ_SOURCE` must be `d1`.
- `YNAB_DB` is required for normal MCP tool registration.
- `YNAB_ACCESS_TOKEN` is required for scheduled D1 sync.
- `YNAB_API_TOKEN` is accepted as a fallback alias when `YNAB_ACCESS_TOKEN` is
  absent.
- `MCP_PUBLIC_URL` is required when `MCP_OAUTH_ENABLED=true`.
- `OAUTH_STATE` is required when OAuth is enabled, unless tests inject an
  OAuth-compatible KV store.
- `ACCESS_TEAM_DOMAIN`, `ACCESS_CLIENT_ID`, and `ACCESS_CLIENT_SECRET` must be
  provided together for Cloudflare Access OIDC.
- `YNAB_STALE_AFTER_MINUTES` controls the read-model freshness threshold and
  defaults to `360`.

Useful optional settings:

- `YNAB_DEFAULT_PLAN_ID`: preferred plan for scheduled sync and omitted
  `planId` inputs.
- `ACCESS_AUTHORIZATION_URL`, `ACCESS_TOKEN_URL`, and `ACCESS_JWKS_URL`:
  Cloudflare Access OIDC endpoint overrides.
- `MCP_SERVER_NAME` and `MCP_SERVER_VERSION`: discovery and version tool output.

## D1 Schema

The schema lives in:

```text
migrations/0001_ynab_read_model.sql
```

It creates:

- sync state tables: `ynab_sync_state`, `ynab_sync_runs`
- metadata tables: `ynab_users`, `ynab_plans`, `ynab_plan_settings`
- budget tables for accounts, categories, months, month categories, payees,
  payee locations, transactions, subtransactions, scheduled transactions,
  scheduled subtransactions, money movements, and money movement groups
- indexes for common date, account, category, payee, scheduled transaction, and
  money movement reads

Money amounts are stored as integer milliunits.

Apply the remote migration after the D1 database exists:

```sh
wrangler d1 migrations apply ynab-mcp-read-model --remote
```

The package script `pnpm run db:migrate:prod` still contains the placeholder
database name `YOUR_DB_NAME`; update that script before using it in a release
flow.

## D1 Sync

The Worker exports a scheduled handler. On each cron invocation it:

1. Resolves the app environment with OAuth disabled for the scheduled path.
2. Requires `YNAB_ACCESS_TOKEN` and `YNAB_DB`.
3. Chooses `YNAB_DEFAULT_PLAN_ID` when configured.
4. Otherwise asks YNAB for plans and uses YNAB's default plan, falling back to
   the first returned plan.
5. Runs the read-model sync service for that single plan.

The sync service processes endpoint configs sequentially. For each endpoint it:

1. Acquires a D1-backed endpoint lease in `ynab_sync_state`.
2. Reads the previous `server_knowledge` cursor.
3. Calls the YNAB delta client with `last_knowledge_of_server` when the endpoint
   supports that path.
4. Writes the returned records into D1.
5. Advances the cursor only after writes succeed.
6. Records failures without advancing the cursor.

Synced endpoints include user metadata, plans, plan settings, accounts,
categories, months, payees, payee locations, scheduled transactions,
transactions, money movements, and money movement groups.

## Deployment

Dry-run the Worker bundle:

```sh
pnpm run bundle:check
```

Deploy:

```sh
pnpm run deploy:prod
```

Smoke production:

```sh
pnpm run test:smoke:prod
```

The combined release command is:

```sh
pnpm run cf:release
```

Before using `cf:release`, fix the `db:migrate:prod` placeholder database name
and confirm `MCP_PUBLIC_URL` is configured in the deployed environment.

## Operational Notes

- The hourly scheduled sync runs one plan per invocation: the configured
  `YNAB_DEFAULT_PLAN_ID`, YNAB's default plan, or the first plan returned by
  YNAB. It does not fan out across every budget automatically.
- If OAuth is enabled and `MCP_PUBLIC_URL` is missing, request handling fails at
  environment resolution before routes run.
- If the read model has never synced an endpoint required by a tool, the tool
  reports `unhealthy` with a `sync_read_model` next action.
- Money movement sync currently refreshes money movements and groups without
  passing the stored `server_knowledge` cursor into those two YNAB calls, then
  records the maximum returned cursor in sync state.
- Metadata endpoints such as users, plans, and plan settings are refreshed as
  bounded metadata reads rather than YNAB delta cursor calls.
- The repository has both fast local gates and a heavier `check:pr` path. Prefer
  the fast gates while editing, then run the broader gate before opening a PR.
