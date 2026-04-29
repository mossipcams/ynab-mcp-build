# ynab-mcp-build

Cloudflare Workers-native MCP server for YNAB.

## DB-Backed Rebuild

The DB-backed read model is a new feature path, not an in-place migration of the existing live YNAB slices.

In `YNAB_READ_SOURCE=d1` mode:

- normal MCP tools read from Cloudflare D1 only
- YNAB API calls are limited to sync/admin code
- tools do not fall back to live YNAB reads
- public tool registration matches the advertised MCP discovery surface
- read tools include freshness metadata for the synced endpoints they require

All advertised normal MCP tools are registered in D1 mode. Core plan, account,
category, month, payee, transaction, scheduled transaction, money movement, and
financial summary tools read through the D1 read model.

## Architecture

```text
YNAB API
  -> bounded sync code
  -> Cloudflare D1 normalized read model
  -> DB-backed slice services
  -> MCP tool responses
```

The YNAB read model lives in D1. The MCP server remains stateless.

OAuth state remains separate and uses the existing Durable Object-backed OAuth state store.

## D1 Schema

The initial schema lives in:

```text
migrations/0001_ynab_read_model.sql
```

The table shapes are aligned to the official YNAB OpenAPI schema used by the
official `ynab` JavaScript SDK. The current validation target is SDK `4.1.0`,
generated from YNAB server specification `1.83.0`.

It creates:

- sync coordination tables: `ynab_sync_state`, `ynab_sync_runs`
- normalized read-model tables for plans, accounts, categories, months, payees, transactions, scheduled transactions, and money movements
- indexes for common MCP reads

Money values are stored as integer milliunits.

Money movements are modeled as category movements from the API:

- `ynab_money_movements` stores `from_category_id`, `to_category_id`, `money_movement_group_id`, and `moved_at`
- `ynab_money_movement_groups` stores `group_created_at`, `month`, `note`, and `performed_by_user_id`

The official money movement SDK methods do not currently expose a
`lastKnowledgeOfServer` argument, so those endpoints should be treated as
bounded refreshes rather than normal delta cursor sync until confirmed against a
live YNAB account.

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

The scheduled Worker sync runs from the Wrangler cron trigger every hour.
It uses `YNAB_DEFAULT_PLAN_ID` when configured; otherwise it discovers YNAB's
default plan from `GET /plans`, falling back to the first returned plan. The
read-model sync service then:

1. Acquires an endpoint lease in `ynab_sync_state`.
2. Reads that endpoint's `server_knowledge` cursor.
3. Calls the YNAB delta endpoint with `last_knowledge_of_server`.
4. Refuses oversized delta responses.
5. Upserts returned rows into D1.
6. Advances `server_knowledge` only after D1 writes succeed.
7. Records failures without advancing the cursor.

Money movements are refreshed as a bounded endpoint because the SDK methods do
not currently expose a delta cursor argument.

## Known Limitations

- Scheduled sync refreshes one configured or discovered default plan; multi-plan cron fan-out is not enabled by default.
- Initial bootstrap for large budgets should be handled carefully because Worker/D1 limits make unbounded imports unsafe.
- Money movements are refreshed as bounded reads until delta cursor support is confirmed for those endpoints.
