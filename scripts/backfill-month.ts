import { getPlatformProxy } from "wrangler";

import { createYnabClient } from "../src/platform/ynab/client.js";
import { backfillPlanMonth } from "../src/platform/ynab/read-model/month-backfill.js";
import { createReadModelSyncRepository } from "../src/platform/ynab/read-model/read-model-sync-repository.js";
import { executeMonthBackfill } from "../src/tooling/backfill-month.js";

// Pass `--remote` to target the deployed read-model D1 (requires Cloudflare
// auth + YNAB_ACCESS_TOKEN in the local env/.dev.vars). Without it the script
// operates on local `.wrangler/state` so it can be exercised safely in dev.
const args = process.argv.slice(2);
const useRemote = args.includes("--remote");

const platform = await getPlatformProxy<{
  YNAB_ACCESS_TOKEN?: string;
  YNAB_API_BASE_URL?: string;
  YNAB_DB?: D1Database;
}>({
  configPath: useRemote ? "./wrangler.remote.jsonc" : "./wrangler.jsonc",
  remoteBindings: useRemote,
});

try {
  const result = await executeMonthBackfill({
    args,
    database: platform.env.YNAB_DB,
    dependencies: {
      backfillPlanMonth,
      createReadModelSyncRepository,
      createYnabClient,
      now: () => new Date().toISOString(),
    },
    env: platform.env,
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await platform.dispose();
}
