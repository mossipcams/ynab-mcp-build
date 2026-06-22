import { getPlatformProxy } from "wrangler";

import { createYnabClient } from "../src/platform/ynab/client.js";
import { backfillPlanMonth } from "../src/platform/ynab/read-model/month-backfill.js";
import { createReadModelSyncRepository } from "../src/platform/ynab/read-model/read-model-sync-repository.js";
import { executeMonthBackfill } from "../src/tooling/backfill-month.js";

const platform = await getPlatformProxy<{
  YNAB_ACCESS_TOKEN?: string;
  YNAB_API_BASE_URL?: string;
  YNAB_DB?: D1Database;
}>({
  configPath: "./wrangler.jsonc",
});

try {
  const result = await executeMonthBackfill({
    args: process.argv.slice(2),
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
