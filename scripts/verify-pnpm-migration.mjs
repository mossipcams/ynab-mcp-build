import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const repoRoot = new URL("..", import.meta.url);

const readText = (path) => readFileSync(new URL(path, repoRoot), "utf8");

const packageJson = JSON.parse(readText("package.json"));
const failures = [];

const fail = (message) => {
  failures.push(message);
};

if (!/^pnpm@\d+\.\d+\.\d+/.test(packageJson.packageManager ?? "")) {
  fail(
    'package.json must declare a pinned pnpm packageManager, for example "pnpm@10.0.0".',
  );
}

if (!existsSync(new URL("pnpm-lock.yaml", repoRoot))) {
  fail("pnpm-lock.yaml must exist.");
}

if (existsSync(new URL("package-lock.json", repoRoot))) {
  fail("package-lock.json must be removed after generating pnpm-lock.yaml.");
}

const packageScripts = Object.entries(packageJson.scripts ?? {});
for (const [scriptName, command] of packageScripts) {
  if (typeof command !== "string") {
    fail(`package.json script "${scriptName}" must be a string.`);
    continue;
  }

  if (/\bnpm\s+run\b|\bnpx\b/.test(command)) {
    fail(`package.json script "${scriptName}" still uses npm/npx: ${command}`);
  }
}

const checkedFiles = [
  ".github/workflows/ci.yml",
  ".githooks/pre-push",
  ".husky/pre-commit",
  ".husky/pre-push",
  "AGENTS.md",
  "README.md",
  "scripts/preflight.mjs",
];

const staleCommandPattern = /\b(?:npm\s+(?:ci|install|test|run)|npx)\b/;

for (const file of checkedFiles) {
  const path = new URL(file, repoRoot);

  if (!existsSync(path)) {
    continue;
  }

  const lines = readFileSync(path, "utf8").split("\n");

  lines.forEach((line, index) => {
    if (staleCommandPattern.test(line)) {
      fail(`${file}:${index + 1} still uses npm/npx: ${line.trim()}`);
    }
  });
}

if (failures.length > 0) {
  console.error(`${basename(process.cwd())} is not fully migrated to pnpm:`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}
