import { getPlatformProxy } from "wrangler";

import { createReadModelIntegrity } from "../src/platform/ynab/read-model/integrity.js";
import { executeSyncDiagnostics } from "../src/tooling/sync-diagnostics.js";

// Pass `--remote` to inspect the deployed read-model D1 (requires Cloudflare
// auth). Without it the script reads local `.wrangler/state`.
const args = process.argv.slice(2);
const useRemote = args.includes("--remote");

const platform = await getPlatformProxy<{ YNAB_DB?: D1Database }>({
  configPath: useRemote ? "./wrangler.remote.jsonc" : "./wrangler.jsonc",
  remoteBindings: useRemote,
});

try {
  const result = await executeSyncDiagnostics({
    args,
    database: platform.env.YNAB_DB,
    dependencies: { createReadModelIntegrity },
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await platform.dispose();
}
