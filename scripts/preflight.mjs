import { spawnSync } from "node:child_process";

export const CI_COMMANDS = [
  "pnpm run cf-typegen",
  "pnpm run typecheck:tsgo",
  "pnpm run lint:fast",
  "pnpm run typecheck:tsc",
  "pnpm run typecheck:spec",
  "pnpm run lint",
  "pnpm run check:deps",
  "pnpm run check:duplication",
  "pnpm run check:knip",
  "pnpm test"
];

export const runCommand = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
};

export const runShellCommand = (command) =>
  runCommand(command, [], {
    shell: true
  });

export const runCi = () => {
  for (const command of CI_COMMANDS) {
    console.log(`\n> ${command}`);
    const status = runShellCommand(command);

    if (status !== 0) {
      return status;
    }
  }

  return 0;
};
