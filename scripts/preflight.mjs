import { spawnSync } from "node:child_process";

export const CI_COMMANDS = [
  "npm run cf-typegen",
  "npm run typecheck:tsgo",
  "npm run lint:fast",
  "npm run typecheck:tsc",
  "npm run typecheck:spec",
  "npm run lint",
  "npm run check:deps",
  "npm run check:duplication",
  "npm run check:knip",
  "npm test",
];

export const runCommand = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
};

export const runShellCommand = (command) =>
  runCommand(command, [], {
    shell: true,
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
