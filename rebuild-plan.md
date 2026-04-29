# YNAB MCP Build Rebuild Plan

## Goal

Rebuild `ynab-mcp-bridge` as a TypeScript-first Cloudflare Workers service with:

- Hono for HTTP routing
- The official MCP TypeScript SDK for the protocol layer
- Slice-oriented architecture for product logic
- Durable Objects for coordinated OAuth state
- Optional D1 for long-lived registrations and audit data
- Web-standard APIs only in production code

## Current Status

Completed:

- `architecture.md` created with Worker-first, slice-first boundaries
- `AGENTS.md` copied into the new build folder and updated to require TDD
- Project scaffold created:
  - `package.json`
  - `wrangler.jsonc`
  - `tsconfig.json`
  - `tsconfig.spec.json`
  - `vitest.config.ts`
  - generated `worker-configuration.d.ts`
- Worker/Hono app shell created:
  - `src/index.ts`
  - `src/app/create-app.ts`
  - `src/http/routes/well-known.ts`
  - `src/http/routes/mcp.ts`
- MCP server shell created:
  - `src/mcp/server.ts`
  - `src/mcp/register-slices.ts`
- First slices implemented:
  - `meta`
  - `plans`
  - `accounts`
  - `transactions`
  - `payees`
  - `money-movements`
  - `financial-health`
- Worker-safe YNAB client seam implemented in `src/platform/ynab/client.ts`
- Shared helpers added for:
  - compact object shaping
  - collection projection/pagination
  - default plan resolution
- Discovery metadata builder added in `src/mcp/discovery.ts`

Currently implemented MCP tools:

- `meta`: `ynab_get_mcp_version`, `ynab_get_user`
- `plans`: `ynab_list_plans`, `ynab_get_plan`, `ynab_list_categories`, `ynab_get_category`, `ynab_get_month_category`, `ynab_get_plan_settings`, `ynab_list_plan_months`, `ynab_get_plan_month`
- `accounts`: `ynab_list_accounts`, `ynab_get_account`
- `transactions`: `ynab_list_transactions`, `ynab_get_transaction`, `ynab_search_transactions`, `ynab_get_transactions_by_month`, `ynab_get_transactions_by_account`, `ynab_get_transactions_by_category`, `ynab_get_transactions_by_payee`, `ynab_list_scheduled_transactions`, `ynab_get_scheduled_transaction`
- `payees`: `ynab_list_payees`, `ynab_get_payee`, `ynab_list_payee_locations`, `ynab_get_payee_location`, `ynab_get_payee_locations_by_payee`
- `money-movements`: `ynab_get_money_movements`, `ynab_get_money_movements_by_month`, `ynab_get_money_movement_groups`, `ynab_get_money_movement_groups_by_month`
- `financial-health`: `ynab_get_monthly_review`, `ynab_get_net_worth_trajectory`, `ynab_get_financial_snapshot`, `ynab_get_financial_health_check`, `ynab_get_spending_summary`, `ynab_get_spending_anomalies`, `ynab_get_cash_flow_summary`, `ynab_get_cash_runway`, `ynab_get_budget_health_summary`, `ynab_get_upcoming_obligations`, `ynab_get_goal_progress_summary`, `ynab_get_budget_cleanup_summary`, `ynab_get_income_summary`, `ynab_get_emergency_fund_coverage`, `ynab_get_debt_summary`, `ynab_get_recurring_expense_summary`, `ynab_get_category_trend_summary`

## Target Structure

- `architecture.md`
- `AGENTS.md`
- `package.json`
- `wrangler.jsonc`
- `tsconfig.json`
- `tsconfig.spec.json`
- `vitest.config.ts`
- `src/index.ts`
- `src/app/create-app.ts`
- `src/http/routes/mcp.ts`
- `src/http/routes/well-known.ts`
- `src/http/routes/oauth.ts`
- `src/mcp/server.ts`
- `src/mcp/register-slices.ts`
- `src/mcp/discovery.ts`
- `src/oauth/core/*`
- `src/oauth/http/*`
- `src/durable-objects/OAuthStateDO.ts`
- `src/repositories/d1/*`
- `src/platform/ynab/*`
- `src/shared/*`
- `src/slices/meta/*`
- `src/slices/plans/*`
- `src/slices/accounts/*`
- `src/slices/transactions/*`
- `src/slices/financial-health/*`

## Slice Shape

Each slice should follow this layout:

- `index.ts`
- `tools.ts`
- `service.ts`
- `schemas.ts`
- `mappers.ts`

## Execution Plan

### Step 1: Create `architecture.md`

Status: completed

1. Define top-level layers and import rules.
- Test to write: none
- Code to implement: `architecture.md` documenting `src/http`, `src/mcp`, `src/oauth`, `src/platform/ynab`, `src/slices`, `src/shared`, `src/durable-objects`, and `src/repositories/d1`
- How to verify it works: manual review against the desired Worker-first, slice-first model

2. Define the per-slice shape.
- Test to write: none
- Code to implement: document `index.ts`, `tools.ts`, `service.ts`, `schemas.ts`, `mappers.ts`
- How to verify it works: later slice migrations fit the structure without exceptions

3. Define non-goals for v1.
- Test to write: none
- Code to implement: explicitly exclude stdio-first support, Express patterns, Node-only APIs, and filesystem-dependent version/config paths
- How to verify it works: later bootstrap tasks do not need compatibility exceptions

Trade-offs:
- Writing strict boundaries early slows the first hour a bit, but it prevents transport/domain coupling later.
- Slice-first architecture is clearer for migration, but it is heavier than a flat `src/` during bootstrap.
- Explicit non-goals reduce accidental scope creep, but they defer some convenience features.

### Step 2: Copy `AGENTS.md`

Status: completed

4. Copy the existing workflow file into the new project.
- Test to write: none
- Code to implement: copy `ynab-mcp-bridge/AGENTS.md` to `ynab-mcp-build/AGENTS.md`
- How to verify it works: compare source and destination contents

Trade-offs:
- Copying it now makes the new folder self-contained and explicit about workflow.
- It may inherit some Node-era assumptions that we later tighten for the rebuild.

### Step 3: Bootstrap the project

Status: completed

5. Create `package.json` with minimal runtime and dev dependencies.
- Test to write: none yet
- Code to implement: `hono`, `@modelcontextprotocol/sdk`, `zod`, `typescript`, `wrangler`, `vitest`, `@cloudflare/vitest-pool-workers`, `@cloudflare/workers-types`
- How to verify it works: install succeeds and scripts resolve

6. Create TypeScript and Vitest config.
- Test to write: failing spec for `GET /.well-known/mcp.json`
- Code to implement: `tsconfig.json`, `tsconfig.spec.json`, `vitest.config.ts`
- How to verify it works: test fails for the right reason, then `typecheck` runs clean

7. Create Wrangler config and Worker typings path.
- Test to write: failing Worker-runtime integration spec
- Code to implement: `wrangler.jsonc`, `cf-typegen` script
- How to verify it works: Worker integration test boots the exported worker

Trade-offs:
- Minimal dependencies keep bootstrap clean, but more may be needed when OAuth lands.
- Split TS configs reduce noise, but they add a small maintenance cost.
- Workers Vitest integration matches the runtime, but it is less flexible than plain Node Vitest.

### Step 4: Build the app shell

Status: completed

8. Add `src/index.ts` Worker entry.
- Test to write: failing Worker entry test
- Code to implement: export default `fetch`
- How to verify it works: Worker runtime test passes

9. Add `src/app/create-app.ts`.
- Test to write: failing route smoke test
- Code to implement: compose the Hono app, bindings typing, error handling, and route mounting
- How to verify it works: route smoke test passes

10. Add `/.well-known/mcp.json` route.
- Test to write: failing route spec returning `200` and expected metadata shape
- Code to implement: `src/http/routes/well-known.ts`
- How to verify it works: route spec passes

Trade-offs:
- Building the app shell before MCP wiring gives a stable base.
- It delays the first true MCP proof slightly, but makes debugging much easier.

### Step 5: Add env and shared plumbing

Status: partially completed

11. Add typed env parsing.
- Test to write: failing spec for required bindings and clear config errors
- Code to implement: `src/shared/env.ts`
- How to verify it works: spec passes and app typing is clean

12. Add shared result/error helpers.
- Test to write: failing unit tests for normalized success/error shapes
- Code to implement: `src/shared/results.ts`, `src/shared/errors.ts`
- How to verify it works: helper tests pass

Completed in this step:

- `src/shared/env.ts`
- `src/shared/results.ts`
- `src/shared/object.ts`
- `src/shared/collections.ts`
- `src/shared/plans.ts`

Trade-offs:
- Typed env early prevents hidden config coupling.
- It adds setup work before feature work, but saves time once Durable Objects and D1 arrive.

### Step 6: Add the MCP protocol shell

Status: completed

13. Add `src/mcp/server.ts`.
- Test to write: failing spec that the server can be constructed without Node imports
- Code to implement: minimal MCP server factory
- How to verify it works: test passes and `rg` confirms no `node:` or Express imports

14. Add `src/mcp/register-slices.ts`.
- Test to write: failing spec that registered slices appear in server metadata
- Code to implement: registry-based slice registration
- How to verify it works: spec passes

15. Add `/mcp` Hono route.
- Test to write: failing route test for MCP endpoint existence and response behavior
- Code to implement: `src/http/routes/mcp.ts`
- How to verify it works: route test passes

Trade-offs:
- Keeping all MCP SDK imports under `src/mcp/**` gives a clean protocol seam.
- It introduces a little indirection when adding tools, but keeps slices protocol-agnostic.

### Step 7: Add the first slice registry proof

Status: completed

16. Add `src/slices/meta/*` as the smallest proof slice.
- Test to write: failing tool registration test for a trivial meta tool
- Code to implement: first slice following the standard shape
- How to verify it works: MCP registry test passes

Trade-offs:
- `meta` is the smallest possible protocol proof.
- It is not the most valuable YNAB feature, so it is a scaffolding slice rather than the first real product win.

### Step 8: Build the Worker-safe YNAB adapter

Status: partially completed

17. Add the fetch-based YNAB client interface.
- Test to write: failing unit test for request construction and response mapping
- Code to implement: `src/platform/ynab/client.ts`
- How to verify it works: test passes

18. Add minimal DTO mapping and auth header wiring.
- Test to write: failing test for token/header usage and mapped output
- Code to implement: `src/platform/ynab/mappers.ts` and client helpers
- How to verify it works: adapter tests pass

Completed in this step:

- `listPlans`
- `getPlan`
- `listAccounts`
- `getAccount`
- direct unit coverage in `src/platform/ynab/client.spec.ts`

Trade-offs:
- Rewriting the YNAB adapter Worker-first avoids dragging Node assumptions into the new core.
- It means we will not get a quick win by copying the old runtime layer wholesale.

### Step 9: Migrate the first useful slice: `plans`

Status: completed

19. Port `ynab_list_plans`.
- Test to write: failing MCP tool test for `ynab_list_plans`
- Code to implement: `src/slices/plans/*`
- How to verify it works: tool test passes through `/mcp`

20. Port the smallest reusable helper needed by `plans`.
- Test to write: failing unit test for helper formatting/mapping behavior
- Code to implement: minimal helper port from the old repo
- How to verify it works: unit test passes

21. Add one plan-detail read tool.
- Test to write: failing MCP tool test for likely `ynab_get_plan`
- Code to implement: extend the `plans` slice
- How to verify it works: tool test passes

Trade-offs:
- `plans` is the best first real slice because it has low coupling and real user value.
- Starting with `plans` instead of `accounts` gives less early coverage of caching and pagination, but leads to a cleaner first migration.

### Step 10: Migrate `accounts`

Status: completed

22. Port `ynab_list_accounts`.
- Test to write: failing MCP tool test
- Code to implement: `src/slices/accounts/*`
- How to verify it works: tool test passes

23. Add plan resolution and cached reads only if `accounts` truly needs them.
- Test to write: failing unit tests around plan resolution or cached read behavior
- Code to implement: minimal shared helpers
- How to verify it works: tests pass

Trade-offs:
- `accounts` is a strong second slice because it forces more realistic domain plumbing.
- Pulling caching in too early risks overbuilding shared infrastructure before we know its final shape.

### Step 11: Add transactions slice

Status: completed

24. Port `ynab_list_transactions`.
- Test to write: failing MCP tool test for listing transactions
- Code to implement: `src/slices/transactions/*` with basic plan resolution and transaction shaping
- How to verify it works: tool test passes through `/mcp`

25. Port `ynab_get_transaction`.
- Test to write: failing MCP tool test for a single transaction
- Code to implement: extend the transactions slice with compact transaction detail output
- How to verify it works: tool test passes

26. Add a first query-oriented transaction tool.
- Test to write: failing MCP tool test for likely `ynab_search_transactions` or `ynab_get_transactions_by_account`
- Code to implement: minimal filtering/query support without over-porting old query infrastructure
- How to verify it works: tool test passes

Trade-offs:
- `transactions` gives strong user value and exercises more realistic data access.
- It can pull in pagination and filtering complexity quickly, so start with the thinnest useful tools.

### Step 12: Add OAuth core with Durable Objects

Status: completed

27. Add runtime-agnostic OAuth core.
- Test to write: failing tests for PKCE, state, one-time code use, and replay prevention
- Code to implement: `src/oauth/core/*`
- How to verify it works: core tests pass

28. Add `OAuthStateDO`.
- Test to write: failing tests for coordinated state lifecycle
- Code to implement: `src/durable-objects/OAuthStateDO.ts`
- How to verify it works: DO tests pass

Trade-offs:
- Durable Objects are the right fit for coordinated short-lived auth state.
- They add testing and operational complexity compared with KV, but avoid consistency problems where they matter most.

### Step 13: Add OAuth HTTP routes

Status: completed

29. Add `/authorize`.
- Test to write: failing route test for valid authorize request handling
- Code to implement: Hono adapter in `src/http/routes/oauth.ts`
- How to verify it works: route test passes

30. Add `/token`.
- Test to write: failing token exchange test
- Code to implement: token route adapter
- How to verify it works: token route test passes

31. Add `/register` and callback route.
- Test to write: failing route tests for registration and callback state handling
- Code to implement: remaining Hono OAuth adapters
- How to verify it works: route tests pass

Trade-offs:
- Delaying OAuth until after the first real slice keeps early progress visible.
- It also means the first milestones are not yet a full production auth story.

### Step 14: Add the optional D1 seam

32. Add registration and audit repository interfaces.
- Test to write: failing repository tests
- Code to implement: `src/repositories/d1/*`
- How to verify it works: tests pass with D1 enabled and the app still boots without it

Trade-offs:
- Keeping D1 optional prevents it from blocking v1 protocol work.
- Optional persistence paths add branching and need clear defaults.

### Step 15: Continue slice migration

33. Financial health
- Test to write: failing MCP tests for one or two headline tools
- Code to implement: `src/slices/financial-health/*`
- How to verify it works: tool tests pass

34. Payees and money movements
- Test to write: failing MCP tests slice by slice
- Code to implement: remaining slices
- How to verify it works: tool tests pass

Trade-offs:
- `transactions` gives high user value but will surface pagination and query complexity.
- `financial-health` is attractive, but depends on primitives being stable first.
- `money-movements` should stay later because it depends on trickier YNAB client behavior.

## Current Verification Baseline

Passing:

- `pnpm test`
- `pnpm run typecheck`
- `pnpm run typecheck:spec`

## Key Strategy Trade-offs

1. `meta` first vs `plans` first
- `meta` is the fastest protocol proof.
- `plans` is the first meaningful YNAB value.
- Recommended approach: use `meta` for protocol proof, then `plans` as the first real slice.

2. Copying old code vs rewriting
- Copying pure helpers is faster and safer.
- Rewriting runtime, transport, and bootstrap is necessary because the old app is Node and Express shaped.
- Recommended approach: copy only runtime-agnostic helpers and slice logic; rewrite runtime, config, transport, and OAuth delivery.

3. OAuth early vs late
- Early OAuth gives a more complete product shape.
- Late OAuth gives faster MCP and slice progress.
- Recommended approach: land it after the Worker shell and first useful slice.

4. D1 now vs later
- D1 now gives a fuller persistence story.
- D1 later keeps the critical path focused.
- Recommended approach: add it after Durable Object-backed OAuth state is stable.

5. Strict boundaries now vs evolve later
- Strict boundaries now reduce future churn.
- They slow bootstrap a little and force earlier architectural decisions.
- Recommended approach: be strict now because this rebuild is explicitly architecture-led.

## Continuation Plan

### Step 16: Finish the remaining `plans` read surface

Status: completed

35. Port `ynab_list_categories`.
- Test to write: failing MCP tool test for listing categories for a resolved plan
- Code to implement: extend `src/platform/ynab/client.ts` and add `src/slices/plans/*` category mapping
- How to verify it works: tool test passes through `/mcp`

36. Port `ynab_get_category` and `ynab_get_month_category`.
- Test to write: failing MCP tool tests for category detail and month-scoped category detail
- Code to implement: add detail lookups and compact response shaping in the `plans` slice
- How to verify it works: both tool tests pass

37. Port `ynab_get_plan_settings`, `ynab_get_plan_month`, and `ynab_list_plan_months`.
- Test to write: failing MCP tool tests for plan settings and month reads
- Code to implement: add the remaining low-coupling plan reads to `src/slices/plans/*`
- How to verify it works: all three tool tests pass and `plans` reaches feature parity for read-only v1

Trade-offs:
- Finishing `plans` before `transactions` gives a more complete low-risk slice.
- It delays transaction work a bit, but reduces context switching and lets us reuse plan/month/category helpers later.

### Step 17: Expand the YNAB client for transaction and payee primitives

Status: completed

38. Add transaction list/detail client methods.
- Test to write: failing client tests for request construction, pagination params, and response mapping
- Code to implement: extend `src/platform/ynab/client.ts` with transaction endpoints and DTO shaping
- How to verify it works: client tests pass without introducing Node-only APIs

39. Add scheduled transaction client methods.
- Test to write: failing client tests for scheduled transaction list/detail reads
- Code to implement: scheduled transaction methods and shared mappers
- How to verify it works: client tests pass

40. Add payee and payee-location client methods.
- Test to write: failing client tests for payee list/detail/location reads
- Code to implement: payee-focused client methods and mapper helpers
- How to verify it works: client tests pass

Trade-offs:
- Growing the client one capability family at a time keeps the surface understandable.
- It creates a few more incremental mapper additions, but avoids a giant adapter dump.

### Step 18: Complete the `transactions` slice

Status: completed

41. Port `ynab_list_transactions`.
- Test to write: failing MCP tool test for top-level transaction listing
- Code to implement: `src/slices/transactions/*` slice shell, schemas, service, and mappers
- How to verify it works: tool test passes through `/mcp`

42. Port `ynab_get_transaction` and `ynab_search_transactions`.
- Test to write: failing MCP tool tests for detail lookup and text/filter search behavior
- Code to implement: transaction detail/query logic with minimal reusable filtering helpers
- How to verify it works: tool tests pass

43. Port `ynab_get_transactions_by_month`, `ynab_get_transactions_by_account`, `ynab_get_transactions_by_category`, and `ynab_get_transactions_by_payee`.
- Test to write: failing MCP tool tests for each scoped query variant
- Code to implement: thin service helpers that reuse shared transaction query plumbing
- How to verify it works: all scoped query tests pass

44. Port `ynab_list_scheduled_transactions` and `ynab_get_scheduled_transaction`.
- Test to write: failing MCP tool tests for scheduled transaction reads
- Code to implement: scheduled transaction handlers inside the transactions slice or a dedicated scheduled submodule if needed
- How to verify it works: scheduled transaction tests pass

Trade-offs:
- A single `transactions` slice keeps read/query behavior coherent.
- The slice can become large quickly, so shared query helpers should stay in `src/shared/**` only when reused by multiple tools.

### Step 19: Add the `payees` slice

Status: completed

45. Port `ynab_list_payees` and `ynab_get_payee`.
- Test to write: failing MCP tool tests for payee list and detail
- Code to implement: `src/slices/payees/*` with payee mappers and service methods
- How to verify it works: payee tool tests pass

46. Port `ynab_list_payee_locations`, `ynab_get_payee_location`, and `ynab_get_payee_locations_by_payee`.
- Test to write: failing MCP tool tests for payee-location reads
- Code to implement: extend the payees slice with location-aware outputs
- How to verify it works: location tool tests pass

Trade-offs:
- `payees` reuses transaction-era client plumbing well.
- Location data may be sparse or inconsistent, so mapper behavior needs explicit tests for empty results.

### Step 20: Add financial-health primitives and summaries

Status: completed

47. Add the minimum shared financial-health computation helpers.
- Test to write: failing unit tests for money totals, month comparisons, trend windows, and anomaly thresholds
- Code to implement: focused helpers in `src/shared/**` or `src/slices/financial-health/**` only where reuse is proven
- How to verify it works: helper tests pass with deterministic fixture data

48. Port headline summary tools.
- Test to write: failing MCP tool tests for `ynab_get_financial_snapshot`, `ynab_get_financial_health_check`, `ynab_get_budget_health_summary`, and `ynab_get_monthly_review`
- Code to implement: `src/slices/financial-health/*` initial summary set
- How to verify it works: tool tests pass and summary outputs stay compact

49. Port cash-flow and spending tools.
- Test to write: failing MCP tool tests for `ynab_get_cash_flow_summary`, `ynab_get_spending_summary`, `ynab_get_spending_anomalies`, and `ynab_get_category_trend_summary`
- Code to implement: extend the financial-health slice with trend and anomaly services
- How to verify it works: tool tests pass

50. Port balance, runway, and obligations tools.
- Test to write: failing MCP tool tests for `ynab_get_net_worth_trajectory`, `ynab_get_cash_runway`, `ynab_get_upcoming_obligations`, `ynab_get_income_summary`, `ynab_get_recurring_expense_summary`, `ynab_get_emergency_fund_coverage`, `ynab_get_goal_progress_summary`, `ynab_get_debt_summary`, and `ynab_get_budget_cleanup_summary`
- Code to implement: finish the financial-health slice using stable transaction/account/category primitives
- How to verify it works: full financial-health tool suite passes

Trade-offs:
- Financial-health tools provide a lot of product value once primitives are stable.
- They are computation-heavy and easiest to get subtly wrong, so deterministic fixture coverage matters more here than broad integration breadth.

### Step 21: Add DB-backed `money-movements`

Status: completed

51. Port `ynab_get_money_movements` and `ynab_get_money_movements_by_month`.
- Test to write: failing MCP tool tests for category movement rows synced into D1
- Code to implement: `src/slices/db-money-movements/*` using the D1 money movement read-model repository
- How to verify it works: DB-backed movement tests pass

52. Port `ynab_get_money_movement_groups` and `ynab_get_money_movement_groups_by_month`.
- Test to write: failing MCP tool tests for grouped D1 movement views
- Code to implement: grouped DB money movement services and mappers
- How to verify it works: grouped DB movement tests pass

Trade-offs:
- These tools naturally sit late because they depend on the money movement read-model schema and sync contract.
- Keeping them read-model backed avoids deriving movement semantics from unrelated transaction data.

### Step 22: Finish meta parity and discovery polish

Status: completed

53. Port `ynab_get_user`.
- Test to write: failing MCP tool test for user/profile metadata
- Code to implement: extend `src/slices/meta/*` and the YNAB client with the smallest necessary user read
- How to verify it works: meta tool tests pass

54. Add `src/mcp/discovery.ts` once the tool surface stabilizes.
- Test to write: failing tests for discovery metadata/document shape
- Code to implement: central discovery metadata builder for `/.well-known/mcp.json` and later resource docs if needed
- How to verify it works: discovery tests pass and route output stays compact

Trade-offs:
- Holding discovery polish until later avoids churn while the tool list is still moving.
- Delaying it too long can hide metadata drift, so it should land before the parity pass is called complete.

### Step 23: Run the parity and cleanup pass

Status: final migration phase

55. Compare the rebuilt tool inventory against the old bridge.
- Test to write: failing inventory/parity test that asserts the expected Worker-native v1 tool list
- Code to implement: tool-list assertion and any missing registrations
- How to verify it works: parity test passes

56. Remove accidental architectural drift.
- Test to write: failing guard tests or static assertions for forbidden imports if needed
- Code to implement: boundary cleanup across `src/http/**`, `src/mcp/**`, `src/slices/**`, and `src/platform/**`
- How to verify it works: tests pass and `rg` confirms no forbidden runtime imports

57. Refresh docs and verification commands.
- Test to write: none
- Code to implement: update `rebuild-plan.md`, `architecture.md`, and README/deploy notes if added later
- How to verify it works: manual review and a clean verification run

Trade-offs:
- A parity pass catches missing tools and registration gaps before OAuth distracts the roadmap.
- It adds some non-feature work, but it is the cleanest point to lock the read-only MCP surface.

## Remaining Backlog

Core MCP parity and local OAuth support are complete for the current rebuild scope.

Remaining platform/runtime work:

- Optional D1 repositories in `src/repositories/d1/*`
- Any additional upstream-IdP callback/broker behavior, if the project chooses to move beyond the current local OAuth server
- Final deployment and operational docs if a public deployment guide is added

## Recommended Near-Term Milestones

1. Add the optional D1 seam only if registration/audit persistence is still required beyond Durable Object storage.
2. Decide whether the project needs an upstream OAuth callback/broker mode in addition to the current local OAuth server.
3. Refresh deployment notes once the intended production auth topology is locked.
