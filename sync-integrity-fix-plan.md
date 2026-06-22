# Sync Integrity Fix Plan

## Assumptions

- Runtime: Cloudflare Workers.
- Module system: TypeScript ESM.
- Test framework: Vitest.
- Normal MCP tools must read from the D1 read model only.
- YNAB API calls belong only in sync/admin paths.

## RCA

The primary issue is that the `months` sync cursor advanced while
`ynab_month_categories` was incomplete.

The deployed month hydration fix prevents future changed month records from
syncing without category detail, but it does not repair already-missed months
such as `2026-06-01`. The cursor may already say there are no changed month
records, so hot sync can skip June even though the read-model table is missing
the rows needed for overspending.

The broader systemic issue is that freshness currently means "endpoint sync
state is ok", not "the tables required by this tool are complete." That lets a
tool confidently return a false answer when dependent rows are missing.

## Related Risk Areas

- `months` vs `ynab_month_categories`.
- `transactions` vs `ynab_subtransactions`.
- `scheduled_transactions` vs `ynab_scheduled_subtransactions`.
- `money_movements` vs `ynab_money_movement_groups`.
- `categories` vs grouped category rows.
- Smoke tests validate transport/deploy more than semantic read-model
  correctness.

## Fix Plan

### 1. Add failing backfill test for one month

- Test: service/admin function fetches `getPlanMonth(planId, "2026-06-01")`
  and calls `upsertMonths` with category detail.
- Code: introduce a small month backfill service in the sync/admin layer.
- Verify: targeted unit test fails first, then passes.

### 2. Add an executable backfill entry point

- Test: script or workflow helper validates required `planId` and `month`
  inputs and calls the backfill service.
- Code: add `scripts/backfill-month.ts` or equivalent admin runner using the
  existing YNAB client and D1 repository.
- Verify: dry-run/mocked test proves it uses month detail, not `/months`.

### 3. Repair June in production

- Test before repair: prove `ynab_get_category(month, categoryId)` fails for a
  June spending category.
- Code: run targeted backfill for `2026-06-01`.
- Verify: `ynab_get_category` succeeds for June category IDs and
  `ynab_get_budget_health_summary` reports the real overspent categories.

### 4. Add month-category integrity checks

- Test: month row exists, categories/transactions exist, but
  `ynab_month_categories` is empty, so freshness/health becomes unhealthy.
- Code: add read-model integrity repository/check for month-dependent tools.
- Verify: budget health refuses `ok` when month-category rows are missing.

### 5. Audit nested sync surfaces

- Test: add failing integrity cases for transactions/subtransactions,
  scheduled/subtransactions, and money movements/groups where practical.
- Code: add diagnostics only unless a concrete bug is found.
- Verify: each risk reports healthy/unhealthy explicitly.

### 6. Fix stale/nonexistent smoke command

- Test: `pnpm run test:smoke:prod` points to a real script.
- Code: create production smoke script.
- Verify: script runs locally with env or fails clearly with missing config.

### 7. Add semantic production smoke checks

- Test: smoke calls spending summary, picks a real category, then calls category
  detail for the same month.
- Code: assert no "month category not found"; assert budget health is not `ok`
  if category detail is missing.
- Verify: smoke would have caught the June missing-month-category bug.

### 8. Add smoke check for overspent consistency

- Test: if budget health says `overspent_total: "0.00"`, verify month
  categories exist and category count is nonzero.
- Code: smoke-level assertion, not hard-coded to a personal budget amount.
- Verify: catches false-zero overspent caused by missing rows.

### 9. Add sync diagnostics output

- Test: diagnostics reports month row count, month-category row count, category
  transaction references, and missing month-category references.
- Code: admin diagnostic helper/script.
- Verify: running diagnostics identifies current June corruption before repair.

### 10. Final verification

- Test: targeted unit/integration tests, smoke dry run, and production smoke
  after backfill.
- Code: no additional code unless failures expose a gap.
- Verify:
  - `pnpm run typecheck:tsgo`
  - `pnpm run lint:fast`
  - targeted Vitest tests
  - `pnpm run test:smoke:prod`
