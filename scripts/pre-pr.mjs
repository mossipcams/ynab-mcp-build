import { runCi, runCommand } from "./preflight.mjs";

const ciStatus = runCi();

if (ciStatus !== 0) {
  process.exitCode = ciStatus;
} else {
  console.log("\n> gh pr create");
  process.exitCode = runCommand("gh", [
    "pr",
    "create",
    ...process.argv.slice(2),
  ]);
}
