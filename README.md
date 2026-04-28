# ynab-mcp-build

Cloudflare Workers-native MCP server for YNAB.

## DB-Backed Rebuild

The DB-backed read model is a new feature path, not an in-place migration of the existing live YNAB slices.

In `YNAB_READ_SOURCE=d1` mode:

- normal MCP tools read from Cloudflare D1 only
- YNAB API calls are limited to sync/admin code
- tools do not fall back to live YNAB reads
- unrebuilt tools return clear DB-mode errors
- every rebuilt read tool includes freshness metadata

Current rebuilt DB-backed tool:

- `ynab_search_transactions`

The remaining public tool names are still registered in D1 mode, but they return a clear “not available yet in DB-backed read mode” error until their DB-backed slices are implemented.

## Architecture

```text
YNAB API
  -> bounded sync code
  -> Cloudflare D1 normalized read model
  -> DB-backed slice services
  -> MCP tool responses
```

Durable state lives in D1. The MCP server remains stateless.

OAuth state remains separate and uses the existing Durable Object-backed OAuth state store.

## D1 Schema

The initial schema lives in:

```text
migrations/0001_ynab_read_model.sql
```

It creates:

- sync coordination tables: `ynab_sync_state`, `ynab_sync_runs`
- normalized read-model tables for plans, accounts, categories, months, payees, transactions, scheduled transactions, and money movements
- indexes for common MCP reads

Money values are stored as integer milliunits.

## Configuration

Wrangler config includes:

```text
YNAB_READ_SOURCE=d1
YNAB_STALE_AFTER_MINUTES=360
YNAB_SYNC_MAX_ROWS_PER_RUN=100
YNAB_DB
```

`YNAB_ACCESS_TOKEN` is required for sync code, but DB-backed read tools should not require it for normal reads.

`YNAB_DEFAULT_PLAN_ID` is optional. If it is not configured, DB-backed tools require `planId`.

## Local Setup

Install dependencies:

```sh
npm install
```

Generate Worker types after changing `wrangler.jsonc`:

```sh
npm run cf-typegen
```

Run tests:

```sh
npm test
```

Run typecheck:

```sh
npm run typecheck
```

Apply the D1 schema with Wrangler once a real database is created and `database_id` is updated in `wrangler.jsonc`.

## Sync Flow

The transaction sync service:

1. Acquires an endpoint lease in `ynab_sync_state`.
2. Reads the endpoint `server_knowledge` cursor.
3. Calls the YNAB delta endpoint with `last_knowledge_of_server`.
4. Refuses oversized delta responses.
5. Upserts returned rows into D1.
6. Advances `server_knowledge` only after D1 writes succeed.
7. Records failures without advancing the cursor.

## Known Limitations

- Only `ynab_search_transactions` is rebuilt against D1 so far.
- Scheduled Worker/admin refresh wiring still needs to be connected to deployment policy.
- Initial bootstrap for large budgets should be handled carefully because Worker/D1 limits make unbounded imports unsafe.
- `wrangler.jsonc` uses a placeholder D1 `database_id`; replace it with the real database id before deploy.
