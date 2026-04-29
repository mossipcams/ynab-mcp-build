import js from "@eslint/js";
import tseslint from "typescript-eslint";

const typeAwareRules = {
  "@typescript-eslint/await-thenable": "error",
  "@typescript-eslint/consistent-type-imports": "error",
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-floating-promises": "error",
  "@typescript-eslint/no-misused-promises": "error",
  "@typescript-eslint/no-unsafe-assignment": "error",
  "@typescript-eslint/no-unsafe-call": "error",
  "@typescript-eslint/no-unsafe-member-access": "error",
  "@typescript-eslint/no-unsafe-return": "error",
  "@typescript-eslint/restrict-template-expressions": "error",
  "@typescript-eslint/require-await": "error",
  "@typescript-eslint/switch-exhaustiveness-check": "error",
};

export default [
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "**/*.spec.ts",
      "tests/**",
      "vitest.stryker.config.ts",
      "worker-configuration.d.ts",
    ],
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.ts", "vitest.config.ts", "vitest.stryker.config.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./tsconfig.spec.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: typeAwareRules,
  },
];
