import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractZodObjectFields } from "./ynab-client-schema-fields.js";
import {
  checkYnabSpecDrift,
  resolveSpecSchemaFields,
  REPO_SCHEMA_TO_SPEC_SCHEMA,
  type YnabSpecSchemas,
  type YnabSpecValue,
} from "./ynab-spec-drift.js";
import { parseYnabSpecYaml } from "./ynab-spec-yaml.js";

const specSnapshotPath = fileURLToPath(
  new URL("./ynab-openapi-spec.yaml", import.meta.url),
);

const ynabClientPath = fileURLToPath(
  new URL("../platform/ynab/client.ts", import.meta.url),
);

function specSchemasFromSnapshot(source: string): YnabSpecSchemas {
  const spec = parseYnabSpecYaml(source);
  const components = spec["components"];

  if (
    typeof components !== "object" ||
    components === null ||
    Array.isArray(components)
  ) {
    throw new Error("YNAB spec snapshot is missing components.");
  }

  const schemas = components["schemas"];

  if (
    typeof schemas !== "object" ||
    schemas === null ||
    Array.isArray(schemas)
  ) {
    throw new Error("YNAB spec snapshot is missing components.schemas.");
  }

  return schemas;
}

function readRepoFields(clientSource: string): {
  [repoSchema: string]: string[];
} {
  const repoFields: { [repoSchema: string]: string[] } = {};

  for (const repoSchema of Object.keys(REPO_SCHEMA_TO_SPEC_SCHEMA)) {
    repoFields[repoSchema] = extractZodObjectFields(clientSource, repoSchema);
  }

  return repoFields;
}

// Deep-clone the parsed snapshot so drift-detection tests can mutate their
// copy without touching the parsed original.
function cloneSpec(value: YnabSpecValue): YnabSpecValue {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(cloneSpec);
  }

  const clone: { [key: string]: YnabSpecValue } = {};

  for (const [key, entry] of Object.entries(value)) {
    clone[key] = cloneSpec(entry);
  }

  return clone;
}

function removeSpecField(
  schemas: YnabSpecSchemas,
  specSchema: string,
  field: string,
): YnabSpecSchemas {
  const cloned = cloneSpec(schemas) as YnabSpecSchemas;

  for (const [name, schema] of Object.entries(cloned)) {
    if (
      typeof schema !== "object" ||
      schema === null ||
      Array.isArray(schema)
    ) {
      continue;
    }

    const properties = schema["properties"];

    if (
      typeof properties !== "object" ||
      properties === null ||
      Array.isArray(properties)
    ) {
      continue;
    }

    if (properties[field] !== undefined) {
      // Delete through a record view: the parsed value type is a union, and
      // the properties guard above proves this entry is a plain record.
      const record = properties as { [key: string]: YnabSpecValue };
      delete record[field];

      if (name !== specSchema) {
        // The field lived on a base schema reached via $ref; that is fine —
        // the resolved field set of `specSchema` no longer contains it.
        continue;
      }
    }
  }

  return cloned;
}

describe("YNAB OpenAPI spec drift check", () => {
  it("parses the committed snapshot", async () => {
    const source = await readFile(specSnapshotPath, "utf8");
    const spec = parseYnabSpecYaml(source);

    expect(spec["openapi"]).toBe("3.1.1");

    const info = spec["info"];

    expect(typeof info === "object" && info !== null).toBe(true);
    expect(info?.["version"]).toBe("1.85.0");

    const schemas = specSchemasFromSnapshot(source);

    for (const specSchema of Object.values(REPO_SCHEMA_TO_SPEC_SCHEMA)) {
      expect(schemas[specSchema], `missing spec schema ${specSchema}`).not.toBe(
        undefined,
      );
    }
  });

  it("resolves allOf/$ref composition when collecting spec fields", async () => {
    const source = await readFile(specSnapshotPath, "utf8");
    const schemas = specSchemasFromSnapshot(source);

    // TransactionDetail composes TransactionSummaryBase via allOf + $ref;
    // both its own and the base schema's fields must be collected.
    const fields = resolveSpecSchemaFields(schemas, "TransactionDetail");

    expect(fields).toContain("id");
    expect(fields).toContain("date");
    expect(fields).toContain("subtransactions");
  });

  it("merges allOf composition with sibling properties on the same schema", () => {
    const schemas: YnabSpecSchemas = {
      Base: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
      Derived: {
        allOf: [{ $ref: "#/components/schemas/Base" }],
        properties: {
          note: { type: "string" },
        },
      },
    };

    const fields = resolveSpecSchemaFields(schemas, "Derived");

    expect([...fields].sort()).toEqual(["id", "name", "note"]);
  });

  it("repo record schemas match the committed spec snapshot", async () => {
    const source = await readFile(specSnapshotPath, "utf8");
    const clientSource = await readFile(ynabClientPath, "utf8");
    const schemas = specSchemasFromSnapshot(source);

    const issues = checkYnabSpecDrift(schemas, readRepoFields(clientSource));

    expect(issues).toEqual([]);
  });

  it("fails when a spec field the repo reads disappears from the snapshot", async () => {
    const source = await readFile(specSnapshotPath, "utf8");
    const clientSource = await readFile(ynabClientPath, "utf8");
    const schemas = specSchemasFromSnapshot(source);

    const drifted = removeSpecField(schemas, "TransactionDetail", "cleared");
    const issues = checkYnabSpecDrift(drifted, readRepoFields(clientSource));

    expect(issues).toEqual([
      {
        kind: "repo-field-missing-from-spec",
        repoSchema: "YnabTransactionRecordSchema",
        specSchema: "TransactionDetail",
        field: "cleared",
      },
    ]);
  });

  it("fails when the repo declares a field the spec does not document", async () => {
    const source = await readFile(specSnapshotPath, "utf8");
    const clientSource = await readFile(ynabClientPath, "utf8");
    const schemas = specSchemasFromSnapshot(source);

    const repoFields = readRepoFields(clientSource);
    repoFields["YnabPayeeRecordSchema"] = [
      ...repoFields["YnabPayeeRecordSchema"],
      "website",
    ];

    const issues = checkYnabSpecDrift(schemas, repoFields);

    expect(issues).toEqual([
      {
        kind: "repo-field-missing-from-spec",
        repoSchema: "YnabPayeeRecordSchema",
        specSchema: "Payee",
        field: "website",
      },
    ]);
  });

  it("keeps allowlisted repo fields from reporting drift", async () => {
    const source = await readFile(specSnapshotPath, "utf8");
    const clientSource = await readFile(ynabClientPath, "utf8");
    const schemas = specSchemasFromSnapshot(source);

    // `deleted` is not documented on MoneyMovement in the spec, but it is on
    // the EXTRA_REPO_FIELDS allowlist, so it must not report drift.
    const issues = checkYnabSpecDrift(schemas, readRepoFields(clientSource));

    expect(
      issues.filter(
        (issue) =>
          issue.specSchema === "MoneyMovement" && issue.field === "deleted",
      ),
    ).toEqual([]);
  });
});
