import { getPlatformProxy } from "wrangler";

import { createReadModelIntegrity } from "../src/platform/ynab/read-model/integrity.js";
import { executeSyncDiagnostics } from "../src/tooling/sync-diagnostics.js";

const platform = await getPlatformProxy<{ YNAB_DB?: D1Database }>({
  configPath: "./wrangler.jsonc",
});

try {
  const result = await executeSyncDiagnostics({
    args: process.argv.slice(2),
    database: platform.env.YNAB_DB,
    dependencies: { createReadModelIntegrity },
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await platform.dispose();
}
