// Extracts the field names declared by the repo's YNAB record zod schemas
// from the source of src/platform/ynab/client.ts.
//
// Source extraction (rather than importing the schemas) is used because the
// money-movement record schemas are module-private in client.ts, and the
// drift check must cover every record schema uniformly without production
// code changes.

// Find the `.object({` literal of a record schema and return the top-level
// field names it declares. Throws when the schema or its object literal
// cannot be located.
export function extractZodObjectFields(
  source: string,
  schemaName: string,
): string[] {
  const declaration = new RegExp(
    `(?:export )?const ${schemaName} = z\\s*\\.object\\(\\{`,
    "u",
  );

  const match = declaration.exec(source);

  if (match === null) {
    throw new Error(
      `Could not locate the zod object literal for ${schemaName} in the YNAB client source.`,
    );
  }

  const braceIndex = match.index + match[0].length - 1;
  const body = readBalancedBraces(source, braceIndex);
  const fields: string[] = [];
  let depth = 1;

  for (const line of body.split("\n")) {
    if (depth === 1) {
      const key = line.match(/^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/u);

      if (key !== null) {
        const name = key[1];

        if (name !== undefined) {
          fields.push(name);
        }
      }
    }

    for (const ch of line) {
      if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
      }
    }
  }

  return fields;
}

// Return the text between the opening brace at `braceIndex` and its matching
// closing brace. The record schema object literals contain no string literals
// with braces, so a plain brace count is sufficient.
function readBalancedBraces(source: string, braceIndex: number): string {
  let depth = 0;

  for (let i = braceIndex; i < source.length; i += 1) {
    const ch = source.charAt(i);

    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(braceIndex + 1, i);
      }
    }
  }

  throw new Error("Unbalanced braces while reading a zod object literal.");
}
