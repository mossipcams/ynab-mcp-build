import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readYnabFixture<T>(name: string) {
  return JSON.parse(
    readFileSync(join(process.cwd(), "tests", "fixtures", "ynab", name), "utf8")
  ) as T;
}
