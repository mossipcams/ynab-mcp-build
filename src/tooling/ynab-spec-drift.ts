// Drift check between the repo's YNAB record zod schemas (declared in
// src/platform/ynab/client.ts) and the committed YNAB OpenAPI spec snapshot
// (src/tooling/ynab-openapi-spec.yaml).
//
// The check is bidirectional:
//   - a field the repo schema declares must exist on the mapped spec object,
//     unless it is on the EXTRA_REPO_FIELDS allowlist below, and
//   - a field the spec documents on a mapped object must be declared by the
//     repo schema, unless it is on the UNTRACKED_SPEC_FIELDS allowlist below.
//
// Both allowlists are explicit and documented: nothing is silently ignored.

import type { YnabSpecValue } from "./ynab-spec-yaml.js";

export type YnabSpecSchemas = { [name: string]: YnabSpecValue };

// Maps each repo record schema in src/platform/ynab/client.ts to the spec
// object under components/schemas that describes the records the repo reads.
// YnabPlanMonthRecordSchema is used for both the months list (MonthSummary)
// and the month detail (MonthDetail); MonthDetail is the superset, so it is
// the mapping target.
export const REPO_SCHEMA_TO_SPEC_SCHEMA = {
  YnabAccountRecordSchema: "Account",
  YnabCategoryRecordSchema: "Category",
  YnabCategoryGroupRecordSchema: "CategoryGroup",
  YnabPlanMonthRecordSchema: "MonthDetail",
  YnabSubtransactionRecordSchema: "SubTransaction",
  YnabTransactionRecordSchema: "TransactionDetail",
  YnabScheduledSubtransactionRecordSchema: "ScheduledSubTransaction",
  YnabScheduledTransactionRecordSchema: "ScheduledTransactionDetail",
  YnabPayeeRecordSchema: "Payee",
  YnabPayeeLocationRecordSchema: "PayeeLocation",
  YnabMoneyMovementRecordSchema: "MoneyMovement",
  YnabMoneyMovementGroupRecordSchema: "MoneyMovementGroup",
} as const;

export type YnabRepoSchemaName = keyof typeof REPO_SCHEMA_TO_SPEC_SCHEMA;

// Repo fields that are intentionally declared even though the mapped spec
// object does not document them. Keyed by spec schema name.
export const EXTRA_REPO_FIELDS: {
  [specSchema: string]: { [field: string]: string };
} = {
  CategoryGroup: {
    // The categories list endpoint returns CategoryGroupWithCategories,
    // which composes CategoryGroup plus a `categories` array. The repo
    // reads that array, so the field is declared on the record schema.
    categories:
      "read from the CategoryGroupWithCategories composition on the categories list endpoint",
  },
  MoneyMovement: {
    // The repo tolerates a deleted flag on money movements; the public spec
    // does not document one on MoneyMovement.
    deleted: "defensive tolerance for soft-deleted records",
  },
  MoneyMovementGroup: {
    // The repo tolerates a deleted flag on money movement groups; the public
    // spec does not document one on MoneyMovementGroup.
    deleted: "defensive tolerance for soft-deleted records",
  },
};

// Spec fields the repo deliberately does not declare on its record schemas.
// Keyed by spec schema name.
export const UNTRACKED_SPEC_FIELDS: {
  [specSchema: string]: { [field: string]: string };
} = {
  Account: {
    ...currencyAndFormattedFields([
      "balance",
      "cleared_balance",
      "uncleared_balance",
    ]),
    // Debt-account fields are not consumed by the read model.
    debt_escrow_amounts: "debt account detail not consumed by the read model",
    debt_interest_rates: "debt account detail not consumed by the read model",
    debt_minimum_payments: "debt account detail not consumed by the read model",
    debt_original_balance: "debt account detail not consumed by the read model",
  },
  Category: {
    ...currencyAndFormattedFields([
      "activity",
      "balance",
      "budgeted",
      "goal_overall_funded",
      "goal_overall_left",
      "goal_target",
      "goal_under_funded",
    ]),
    // Internal bookkeeping flag, not consumed by the read model.
    internal: "internal YNAB flag not consumed by the read model",
  },
  CategoryGroup: {
    internal: "internal YNAB flag not consumed by the read model",
  },
  MonthDetail: {
    ...currencyAndFormattedFields([
      "activity",
      "budgeted",
      "income",
      "to_be_budgeted",
    ]),
  },
  SubTransaction: {
    ...currencyAndFormattedFields(["amount"]),
  },
  TransactionDetail: {
    ...currencyAndFormattedFields(["amount"]),
  },
  ScheduledSubTransaction: {
    ...currencyAndFormattedFields(["amount"]),
  },
  ScheduledTransactionDetail: {
    ...currencyAndFormattedFields(["amount"]),
  },
  MoneyMovement: {
    ...currencyAndFormattedFields(["amount"]),
  },
};

// The spec documents `*_currency` and `*_formatted` display companions for
// money fields. The repo stores integer milliunits only and never reads the
// display companions, so they are untracked by construction.
function currencyAndFormattedFields(baseFields: string[]): {
  [field: string]: string;
} {
  const fields: { [field: string]: string } = {};

  for (const base of baseFields) {
    fields[`${base}_currency`] =
      "display companion of a money field; the read model stores milliunits only";
    fields[`${base}_formatted`] =
      "display companion of a money field; the read model stores milliunits only";
  }

  return fields;
}

export type YnabSpecDriftIssue =
  | {
      kind: "repo-field-missing-from-spec";
      repoSchema: YnabRepoSchemaName;
      specSchema: string;
      field: string;
    }
  | {
      kind: "spec-field-missing-from-repo";
      repoSchema: YnabRepoSchemaName;
      specSchema: string;
      field: string;
    }
  | {
      kind: "spec-schema-missing";
      repoSchema: YnabRepoSchemaName;
      specSchema: string;
      field: string;
    };

// Collect the property names documented on a spec schema, resolving `allOf`
// composition and `$ref` pointers to base schemas.
export function resolveSpecSchemaFields(
  schemas: YnabSpecSchemas,
  name: string,
): string[] {
  const fields: string[] = [];
  const seen = new Set<string>();

  function visit(schema: YnabSpecValue, refName: string | null): void {
    if (typeof schema !== "object" || schema === null) {
      return;
    }

    if (Array.isArray(schema)) {
      for (const part of schema) {
        visit(part, null);
      }
      return;
    }

    if (refName !== null && seen.has(refName)) {
      return;
    }

    if (refName !== null) {
      seen.add(refName);
    }

    const allOf = schema["allOf"];

    if (allOf !== undefined) {
      visit(allOf, null);
    }

    const ref = schema["$ref"];

    if (typeof ref === "string" && ref.startsWith("#/components/schemas/")) {
      const target = ref.slice("#/components/schemas/".length);
      const targetSchema = schemas[target];

      if (targetSchema !== undefined) {
        visit(targetSchema, target);
      }
      return;
    }

    const properties = schema["properties"];

    if (
      typeof properties === "object" &&
      properties !== null &&
      !Array.isArray(properties)
    ) {
      for (const field of Object.keys(properties)) {
        if (!fields.includes(field)) {
          fields.push(field);
        }
      }
    }
  }

  const root = schemas[name];

  if (root !== undefined) {
    visit(root, name);
  }

  return fields;
}

// Compare the repo's declared record fields against the spec snapshot.
// `repoFields` maps each repo schema name to the field names its zod object
// declares. Returns every drift issue found; an empty array means the repo
// schemas and the snapshot agree (modulo the documented allowlists).
export function checkYnabSpecDrift(
  schemas: YnabSpecSchemas,
  repoFields: { [repoSchema: string]: string[] },
): YnabSpecDriftIssue[] {
  const issues: YnabSpecDriftIssue[] = [];

  // Object.entries widens the keys to string; the mapping's keys are exactly
  // YnabRepoSchemaName, so narrowing back is safe.
  const entries = Object.entries(REPO_SCHEMA_TO_SPEC_SCHEMA) as Array<
    [YnabRepoSchemaName, string]
  >;

  for (const [repoSchema, specSchema] of entries) {
    const declared = repoFields[repoSchema];

    if (declared === undefined) {
      throw new Error(
        `No repo fields provided for ${repoSchema}; the drift check cannot run.`,
      );
    }

    const specFields = resolveSpecSchemaFields(schemas, specSchema);

    if (specFields.length === 0) {
      issues.push({
        kind: "spec-schema-missing",
        repoSchema,
        specSchema,
        field: "",
      });
      continue;
    }

    const extraAllowlist = EXTRA_REPO_FIELDS[specSchema] ?? {};
    const untrackedAllowlist = UNTRACKED_SPEC_FIELDS[specSchema] ?? {};

    for (const field of declared) {
      if (specFields.includes(field)) {
        continue;
      }

      if (extraAllowlist[field] !== undefined) {
        continue;
      }

      issues.push({
        kind: "repo-field-missing-from-spec",
        repoSchema,
        specSchema,
        field,
      });
    }

    for (const field of specFields) {
      if (declared.includes(field)) {
        continue;
      }

      if (untrackedAllowlist[field] !== undefined) {
        continue;
      }

      issues.push({
        kind: "spec-field-missing-from-repo",
        repoSchema,
        specSchema,
        field,
      });
    }
  }

  return issues;
}
