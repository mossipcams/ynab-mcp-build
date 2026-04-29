import { describe, expect, it } from "vitest";

const requiredRules = [
  "@typescript-eslint/ban-ts-comment",
  "@typescript-eslint/no-floating-promises",
  "@typescript-eslint/no-misused-promises",
  "@typescript-eslint/no-unnecessary-condition",
  "@typescript-eslint/no-unsafe-assignment",
  "@typescript-eslint/no-unsafe-member-access",
  "@typescript-eslint/no-unsafe-return",
  "@typescript-eslint/no-unsafe-call",
  "@typescript-eslint/only-throw-error",
  "@typescript-eslint/restrict-template-expressions",
  "@typescript-eslint/switch-exhaustiveness-check",
  "@typescript-eslint/consistent-type-imports",
  "@typescript-eslint/use-unknown-in-catch-callback-variable",
] as const;

describe("eslint config", () => {
  it("enables the full type-aware TypeScript rule set", async () => {
    const eslintConfig = await import("../../eslint.config.mjs");
    const configEntries = eslintConfig.default as Array<{
      rules?: Record<string, unknown>;
    }>;
    const enabledRules = Object.assign(
      {},
      ...configEntries.map((entry) => entry.rules ?? {}),
    ) as Record<string, unknown>;

    for (const ruleName of requiredRules) {
      expect(enabledRules[ruleName], ruleName).toBe("error");
    }
  });
});
