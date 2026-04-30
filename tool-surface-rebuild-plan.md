# MCP Tool Surface Rebuild Plan

This is a rebuild, not a compatibility migration. Removed MCP tools are deleted
from production registration and discovery. No aliases, deprecated wrappers, or
hidden legacy tool paths are kept.

## Execution Rule

For each code task:

1. Write the failing test.
2. Run the focused test and confirm the expected failure.
3. Implement the minimal production code.
4. Re-run the focused test and confirm it passes.
5. Run fast gates:
   - `rtk pnpm run typecheck:tsgo`
   - `rtk pnpm run lint:fast`

The top-level `tests/` directory is not modified.

## Target Public MCP Tools

Final exposed MCP tools: 27.

```text
ynab_list_plans
ynab_list_accounts
ynab_get_account
ynab_list_categories
ynab_get_category
ynab_list_months
ynab_get_month
ynab_list_payees
ynab_search_transactions
ynab_get_transaction
ynab_search_scheduled_transactions
ynab_get_scheduled_transaction
ynab_search_money_movements
ynab_get_monthly_review
ynab_get_financial_snapshot
ynab_get_financial_health_check
ynab_get_budget_health_summary
ynab_get_budget_cleanup_summary
ynab_get_cash_flow_summary
ynab_get_spending_summary
ynab_get_spending_anomalies
ynab_get_category_trend_summary
ynab_get_upcoming_obligations
ynab_get_income_summary
ynab_get_recurring_expense_summary
ynab_get_cash_resilience_summary
ynab_get_net_worth_trajectory
```

## Task 1: Boundary Refresh

Test: none.

How: read `architecture.md` before edits and keep changes within `src/app/**`,
`src/mcp/**`, `src/slices/**`, `src/shared/**`, and
`src/platform/ynab/read-model/**`.

Verify: no command needed because no code changes.

## Task 2: Remove Diagnostic And Non-Financial Tools

Removed tools:

- `ynab_get_mcp_version`
- `ynab_get_user`
- `ynab_get_plan_settings`
- `ynab_list_payee_locations`
- `ynab_get_payee_location`
- `ynab_get_payee_locations_by_payee`

Test file: `src/mcp/tool-surface.spec.ts`.

How to test:

- Create `registeredToolNames()` using `getRegisteredToolDefinitions(fakeD1Env, deps).map(d => d.name)`.
- Create `discoveredToolNames()` from `buildDiscoveryDocument(fakeEnv).tools.names`.
- Assert each removed name is absent from both registration and discovery.
- Assert `buildDiscoveryDocument(env).name` and `.version` still exist, proving
  server metadata remains available without diagnostic tools.

Expected first failure: removed names still appear.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts`.

Implement: remove those tool definitions from app registration/discovery; delete
now-unused payee-location/meta exposures.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 3: Remove Weak Standalone Lookup Tools

Removed tools:

- `ynab_get_plan`
- `ynab_get_payee`

Test files: `src/mcp/tool-surface.spec.ts`, plan/payee service specs when useful.

How to test:

- Assert both names are absent from registered and discovered names.
- Execute `ynab_list_plans`; assert returned plans include `id` and `name`.
- Execute `ynab_list_payees`; assert returned payees include `id`, `name`, and
  optional `transfer_account_id`.
- This proves list tools still support selection/filtering without standalone
  get tools.

Expected first failure: old tools still appear.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts src/slices/plans/service.spec.ts src/slices/payees/service.spec.ts`.

Implement: remove get-plan/get-payee tool definitions and unused service exports.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 4: Add Final Public Surface Contract

Target count: 27 tools.

Test file: `src/mcp/tool-surface.spec.ts`.

How to test:

- Define `EXPECTED_PUBLIC_TOOL_NAMES` inline in the spec.
- Assert `DISCOVERY_TOOL_NAMES` equals that exact array.
- Assert `buildDiscoveryDocument(env).tools.count === 27`.
- Assert registered names sorted equal expected names sorted.
- Assert no unexpected extras using set equality.

Expected first failure: the surface still contains consolidation targets.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts`.

Implement: keep this contract green as later consolidation tasks delete old
tools and introduce rebuilt tools.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast` when
production code changes.

## Task 5: Consolidate Transactions Into One Search Tool

Removed tools:

- `ynab_list_transactions`
- `ynab_get_transactions_by_month`
- `ynab_get_transactions_by_account`
- `ynab_get_transactions_by_category`
- `ynab_get_transactions_by_payee`

Kept tools:

- `ynab_search_transactions`
- `ynab_get_transaction`

Test files: `src/mcp/tool-surface.spec.ts`,
`src/slices/db-transactions/service.spec.ts`.

How to test:

- Surface test: assert removed transaction names are absent.
- Fake repository test: create a repository mock that records the input passed to
  `searchTransactions`.
- Call service with `{}`; assert repository receives default `limit`, `offset`,
  `planId`, and no selector filters.
- Call with `{ month: "2026-04-01" }`; assert `startDate === "2026-04-01"` and
  `endDate === "2026-04-30"`.
- Call with `{ accountId, categoryId, payeeId }`; assert repository receives
  `accountIds: [id]`, `categoryIds: [id]`, `payeeIds: [id]`.
- Call with date range, sort, limit, offset; assert exact repository input.
- Call with `fields` and `includeIds: false`; assert output projection omits
  `id`.
- Call with `includeSummary: true`; assert totals/top category/top payee keys
  exist.

Expected first failure: old tools exist and `month` is unsupported.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts src/slices/db-transactions/service.spec.ts`.

Implement: add `month` to search schema/service; delete redundant transaction
tools and dead service functions.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 6: Preserve Rich Transaction Detail

Test files: transaction service specs.

How to test:

- Arrange fake transaction with memo, flags, account/payee/category ids,
  transfer ids, import ids, debt type, deleted flag, and subtransactions.
- Execute `ynab_get_transaction`.
- Assert all rich detail fields are present under the detail result.
- Execute `ynab_search_transactions` with the same row available.
- Assert default search row includes compact fields only and excludes
  memo/import/subtransactions.

Expected first failure: exact detail may still be too compact.

Focused run: `rtk pnpm vitest run src/slices/transactions/service.spec.ts src/slices/db-transactions/service.spec.ts`.

Implement: enrich exact transaction mapper; keep search compact.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 7: Fix Amount Filter Semantics

Test file: `src/slices/db-transactions/service.spec.ts`.

How to test:

- Use a repository mock capturing input.
- Call `searchTransactions({ minAmount: 50 })`; assert captured
  `minAmountMilliunits === 50000`.
- Call `searchTransactions({ maxAmount: 100.25 })`; assert captured
  `maxAmountMilliunits === 100250`.
- Assert response filter echo says `"50.00"` and `"100.25"`.
- Call with `minAmount: -25`; assert captured value is `-25000`.

Expected first failure: values pass through as raw milliunits.

Focused run: `rtk pnpm vitest run src/slices/db-transactions/service.spec.ts`.

Implement: convert public decimal amount units to milliunits internally.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 8: Rebuild Scheduled Transaction Search

Removed tool:

- `ynab_list_scheduled_transactions`

Added tool:

- `ynab_search_scheduled_transactions`

Test files: `src/mcp/tool-surface.spec.ts`,
`src/slices/db-scheduled-transactions/service.spec.ts`.

How to test:

- Surface test: old name absent, new name present.
- Arrange fake scheduled rows with different `date_next`, `account_id`,
  `category_id`, `payee_id`.
- Call search with no filters; assert compact rows and count.
- Call with `fromDate`/`toDate`; assert only matching `date_next` rows.
- Call with account/category/payee filters; assert only matching rows.
- Call with limit/offset; assert pagination metadata.
- Call with fields/includeIds false; assert projection.
- Execute exact get tool; assert rich scheduled detail by id still works.

Expected first failure: new tool missing.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts src/slices/db-scheduled-transactions/service.spec.ts`.

Implement: replace list tool with search tool and delete old path.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 9: Rebuild Money Movement Search

Removed tools:

- `ynab_get_money_movements`
- `ynab_get_money_movements_by_month`
- `ynab_get_money_movement_groups`
- `ynab_get_money_movement_groups_by_month`

Added tool:

- `ynab_search_money_movements`

Test files: surface spec and `src/slices/db-money-movements/service.spec.ts`.

How to test:

- Surface test: old four names absent, new name present.
- Arrange fake movement rows and group rows across multiple months.
- Call with `{}`; assert individual movement output and `movement_count`.
- Call with `{ month }`; assert only that month.
- Call with `{ fromMonth, toMonth }`; assert inclusive range.
- Call with `{ groupBy: "group" }`; assert grouped output, `group_count`, totals.
- Call with limit/offset; assert pagination metadata.

Expected first failure: new tool missing and old tools present.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts src/slices/db-money-movements/service.spec.ts`.

Implement: one search tool/service; delete redundant wrappers.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 10: Fold Month Category Into Category

Removed tool:

- `ynab_get_month_category`

Changed tool:

- `ynab_get_category` accepts optional `month`.

Test files: surface spec and plan/category specs.

How to test:

- Surface test: old name absent.
- Fake client/read-model test: call category without month; assert base fields.
- Call category with month; assert month fields `budgeted`, `activity`,
  `balance`, `goalUnderFunded`.
- Assert freshness endpoints include categories/months for month-scoped call.

Expected first failure: old tool exists or category schema lacks `month`.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts src/slices/plans/service.spec.ts`.

Implement: add optional month routing; delete old tool.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 11: Rebuild Month Tool Names

Removed tools:

- `ynab_list_plan_months`
- `ynab_get_plan_month`

Added tools:

- `ynab_list_months`
- `ynab_get_month`

Test files: surface spec and plan specs.

How to test:

- Surface test: old names absent and new names present.
- Execute `ynab_list_months`; assert same summary shape as old month list.
- Execute `ynab_get_month`; assert detail includes month fields and categories.
- Assert schema key is `month`.

Expected first failure: new names missing.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts src/slices/plans/service.spec.ts`.

Implement: expose new names; delete old definitions.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 12: Merge Cash Runway And Emergency Fund

Removed tools:

- `ynab_get_cash_runway`
- `ynab_get_emergency_fund_coverage`

Added tool:

- `ynab_get_cash_resilience_summary`

Test file: `src/slices/financial-health/service.spec.ts` plus surface spec.

How to test:

- Surface: old names absent, new present.
- Arrange accounts, recent months, scheduled transactions.
- Execute new summary.
- Assert `liquid_cash`, `average_monthly_spending`,
  `average_daily_outflow`, `coverage_months`, `runway_days`,
  `scheduled_net_next_30d`, `status`, `months_considered`.
- Call with `detailLevel: "brief"`; assert no example/support arrays.
- Call with `detailLevel: "detailed"`; assert bounded support fields if
  implemented.

Expected first failure: new tool/function missing.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts src/slices/financial-health/service.spec.ts`.

Implement: merge logic and delete old functions/tools.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 13: Fold Goals And Debt Into Summaries

Removed tools:

- `ynab_get_goal_progress_summary`
- `ynab_get_debt_summary`

Enriched tools:

- `ynab_get_budget_health_summary`
- `ynab_get_financial_snapshot`

Test file: financial-health spec and surface spec.

How to test:

- Surface: old names absent.
- Arrange categories with goal underfunding.
- Execute budget health; assert `goal_count`, `underfunded_goal_total`,
  `off_track_goal_count`, `top_underfunded_goals`.
- Arrange negative-balance accounts.
- Execute financial snapshot; assert `total_debt`, `debt_account_count`,
  `top_debt_accounts`.
- Pass `topN: 1`; assert top lists length is 1.

Expected first failure: fields missing and old tools present.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts src/slices/financial-health/service.spec.ts`.

Implement: move useful fields into existing summaries; delete standalone
tools/functions.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 14: Standardize Input Names

Test file: `src/mcp/tool-surface.spec.ts` or `src/shared/tool-inputs.spec.ts`.

How to test:

- Get every registered exposed definition.
- Inspect `Object.keys(definition.inputSchema)`.
- Assert no keys named `latestMonth` or `asOfMonth`.
- Assert summary tools use only `month` or `fromMonth`/`toMonth` for month
  selection.
- Assert date-based tools use `fromDate`/`toDate` or `asOfDate`.
- Assert common controls are consistently named: `planId`, `topN`,
  `detailLevel`, `limit`, `offset`, `fields`, `includeIds`.

Expected first failure: current tools use `latestMonth` and `asOfMonth`.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts src/shared/tool-inputs.spec.ts`.

Implement: centralize schemas and rename inputs.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 15: Standardize Output Envelopes

Test file: `src/mcp/register-slices.db.spec.ts`.

How to test:

- Execute one representative list tool, get tool, search tool, and summary tool
  through registered definitions.
- Assert each returns top-level `status`, `data_freshness`, and `data`.
- Mark fake sync state unhealthy.
- Execute representative tool; assert `status: "unhealthy"`, `data: null`,
  and `next_action.code === "sync_read_model"`.
- Execute `ynab_search_transactions`; assert it has a single envelope, not
  `data.status` nested inside outer status.

Expected first failure: self-managed DB tools or wrappers may be inconsistent.

Focused run: `rtk pnpm vitest run src/mcp/register-slices.db.spec.ts`.

Implement: one envelope path for all normal exposed tools.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 16: Token Efficiency Defaults

Test files: search service specs and financial-health spec.

How to test:

- For each search tool, call with no `fields`; assert compact default fields
  only.
- Call with enough rows to exceed default limit; assert bounded output,
  `returned_count`, `has_more`, `limit`, `offset`.
- Call exact get tool; assert richer fields than search row.
- Call summary with `topN: 2`; assert all top arrays length <= 2.
- Call summary with `detailLevel: "brief"`; assert example/support arrays
  omitted.
- Call with `detailLevel: "detailed"`; assert support arrays are still bounded
  by `topN`.

Expected first failure: some defaults may be unbounded or inconsistent.

Focused run: service specs for transactions, scheduled transactions, money
movements, and financial health.

Implement: normalize defaults/projection/detail-level behavior.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`.

## Task 17: Delete Dead Code And Rebuild Docs

Test: no new docs-only test.

How to verify:

- Run `rtk rg` for every removed tool name and old service function name.
- Accept matches only in tests that assert absence or docs explaining the current
  rebuilt surface.
- README says 27 tools and describes the rebuilt categories without migration or
  compatibility language.

Focused run: `rtk pnpm vitest run src/mcp/tool-surface.spec.ts`.

Implement: delete unused production exports/imports/files where appropriate;
update README.

Fast verify: `rtk pnpm run typecheck:tsgo`; `rtk pnpm run lint:fast`;
`rtk pnpm run deps:check` if cleanup touches many exports.

## Task 18: Final Full Gates

Test: none new.

How to verify:

- `rtk pnpm run typecheck:tsgo`
- `rtk pnpm run lint:fast`
- `rtk pnpm test`
- `rtk pnpm run deps:check` if not already clean.
