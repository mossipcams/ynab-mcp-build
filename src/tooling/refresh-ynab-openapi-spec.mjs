// Refreshes the committed YNAB OpenAPI spec snapshot from the public spec
// published by the YNAB JS SDK (no auth required):
//
//   https://raw.githubusercontent.com/ynab/ynab-sdk-js/main/open_api_spec.yaml
//
// Run from the repo root:
//
//   node src/tooling/refresh-ynab-openapi-spec.mjs
//
// The snapshot (src/tooling/ynab-openapi-spec.yaml) is kept byte-identical to
// the upstream file so a refresh is a plain re-download: diff the file after
// running this script to review spec changes, then re-run the drift check
// (pnpm test) and update the allowlists in ynab-spec-drift.ts if the repo's
// record schemas need to follow.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const YNAB_SPEC_URL =
  "https://raw.githubusercontent.com/ynab/ynab-sdk-js/main/open_api_spec.yaml";

const snapshotPath = fileURLToPath(
  new URL("./ynab-openapi-spec.yaml", import.meta.url),
);

const response = await globalThis.fetch(YNAB_SPEC_URL);

if (!response.ok) {
  console.error(
    `Failed to download the YNAB OpenAPI spec: HTTP ${response.status}.`,
  );
  process.exitCode = 1;
} else {
  const body = await response.text();

  if (body.length === 0) {
    console.error("The YNAB OpenAPI spec download was empty.");
    process.exitCode = 1;
  } else {
    await writeFile(snapshotPath, body, "utf8");
    console.log(`Wrote ${body.length} bytes to ${snapshotPath}`);
  }
}
