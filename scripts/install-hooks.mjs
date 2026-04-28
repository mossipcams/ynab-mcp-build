import { runCommand } from "./preflight.mjs";

process.exitCode = runCommand("git", [
  "config",
  "core.hooksPath",
  ".githooks"
]);
