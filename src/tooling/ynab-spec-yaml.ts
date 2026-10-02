// Minimal YAML-subset parser for the vendored YNAB OpenAPI spec snapshot
// (src/tooling/ynab-openapi-spec.yaml).
//
// The repo has no YAML dependency, and the check must run fully offline in
// CI, so this parser covers exactly the YAML constructs the published spec
// uses: block mappings, block sequences (including inline `- key: value`
// items), plain scalars with multi-line folding, single- and double-quoted
// strings (including multi-line with `''` escapes), empty flow collections
// (`[]`, `{}`), and quoted keys. It does not support anchors, aliases,
// block scalars (`|`/`>`), or non-empty flow collections.
//
// The parser is validated against the committed snapshot by
// ynab-spec-drift.spec.ts, which asserts the resolved field sets of every
// mapped spec schema.

export type YnabSpecValue =
  | string
  | number
  | boolean
  | null
  | YnabSpecValue[]
  | { [key: string]: YnabSpecValue };

type YnabSpecLine = {
  indent: number;
  text: string;
};

type YnabSpecPos = {
  index: number;
};

export function parseYnabSpecYaml(source: string): {
  [key: string]: YnabSpecValue;
} {
  const lines = toSpecLines(source);

  if (lines.length === 0) {
    return {};
  }

  const first = lines[0];

  if (first === undefined) {
    return {};
  }

  const pos: YnabSpecPos = { index: 0 };
  const block = parseBlock(lines, pos, first.indent);

  if (typeof block === "object" && block !== null && !Array.isArray(block)) {
    return block;
  }

  throw new Error("YNAB spec snapshot does not start with a mapping.");
}

function toSpecLines(source: string): YnabSpecLine[] {
  const lines: YnabSpecLine[] = [];

  for (const raw of source.split(/\r?\n/u)) {
    const trimmed = raw.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    lines.push({ indent: raw.length - raw.trimStart().length, text: trimmed });
  }

  return lines;
}

function isDashItem(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

// Split `key: value` at the first `: ` (or trailing `:`) outside quotes.
// Returns null for lines that are not mapping entries.
function splitKey(text: string): { key: string; value: string } | null {
  let quote: string | null = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);

    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (ch === ":" && (i === text.length - 1 || text.charAt(i + 1) === " ")) {
      return { key: text.slice(0, i).trim(), value: text.slice(i + 1).trim() };
    }
  }

  return null;
}

function unquoteKey(key: string): string {
  if (
    key.length >= 2 &&
    ((key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'")))
  ) {
    return key.slice(1, -1);
  }

  return key;
}

function coerceScalar(text: string): string | number | boolean | null {
  if (text === "null" || text === "~") {
    return null;
  }

  if (text === "true") {
    return true;
  }

  if (text === "false") {
    return false;
  }

  if (/^-?\d+$/u.test(text)) {
    return Number(text);
  }

  if (/^-?\d+\.\d+$/u.test(text)) {
    return Number(text);
  }

  return text;
}

type InlineValue = {
  value: YnabSpecValue;
  consumed: number;
};

// Parse an inline value that starts on the current key/dash line. `pos.index`
// already points past that line; `consumed` counts extra lines eaten.
function parseInlineValue(
  valueText: string,
  lines: YnabSpecLine[],
  pos: YnabSpecPos,
  blockIndent: number,
): InlineValue {
  if (valueText === "[]") {
    return { value: [], consumed: 0 };
  }

  if (valueText === "{}") {
    return { value: {}, consumed: 0 };
  }

  if (valueText.startsWith("'") || valueText.startsWith('"')) {
    return parseQuotedValue(valueText, lines, pos, valueText.charAt(0));
  }

  // Plain scalar, possibly folded across continuation lines. A continuation
  // line must be indented deeper than the enclosing block and must not
  // itself be a mapping entry (a `key: value` line ends the scalar).
  let value = valueText;
  let consumed = 0;

  while (pos.index + consumed < lines.length) {
    const next = lines[pos.index + consumed];

    if (next === undefined) {
      break;
    }

    if (next.indent <= blockIndent) {
      break;
    }

    if (splitKey(next.text) !== null) {
      break;
    }

    value = `${value} ${next.text}`;
    consumed += 1;
  }

  return { value: coerceScalar(value), consumed };
}

function parseQuotedValue(
  firstText: string,
  lines: YnabSpecLine[],
  pos: YnabSpecPos,
  quote: string,
): InlineValue {
  let body = firstText.slice(1);
  let consumed = 0;
  let scan = scanQuotedBody(body, quote);

  while (!scan.closed) {
    if (pos.index + consumed >= lines.length) {
      throw new Error("YNAB spec snapshot has an unterminated quoted string.");
    }

    const next = lines[pos.index + consumed];

    if (next === undefined) {
      throw new Error("YNAB spec snapshot has an unterminated quoted string.");
    }

    consumed += 1;
    body = `${body} ${next.text}`;
    scan = scanQuotedBody(body, quote);
  }

  return { value: scan.body, consumed };
}

// Scan a quoted body. For single quotes, `''` is an escaped quote; a lone
// quote closes the string. For double quotes, a lone quote closes it (the
// published spec contains no backslash escapes).
function scanQuotedBody(
  body: string,
  quote: string,
): { closed: boolean; body: string } {
  let out = "";

  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charAt(i);

    if (ch !== quote) {
      out += ch;
      continue;
    }

    if (quote === "'" && body.charAt(i + 1) === "'") {
      out += "'";
      i += 1;
      continue;
    }

    return { closed: true, body: out };
  }

  return { closed: false, body: out };
}

function parseBlock(
  lines: YnabSpecLine[],
  pos: YnabSpecPos,
  indent: number,
): YnabSpecValue {
  const line = lines[pos.index];

  if (line === undefined) {
    return null;
  }

  if (isDashItem(line.text)) {
    return parseSequence(lines, pos, indent);
  }

  return parseMapping(lines, pos, indent);
}

function parseMapping(
  lines: YnabSpecLine[],
  pos: YnabSpecPos,
  indent: number,
): { [key: string]: YnabSpecValue } {
  const result: { [key: string]: YnabSpecValue } = {};

  while (pos.index < lines.length) {
    const line = lines[pos.index];

    if (line === undefined || line.indent !== indent || isDashItem(line.text)) {
      break;
    }

    const split = splitKey(line.text);

    if (split === null) {
      break;
    }

    pos.index += 1;
    const key = unquoteKey(split.key);

    if (split.value === "") {
      const next = lines[pos.index];

      if (next !== undefined && next.indent > indent) {
        result[key] = parseBlock(lines, pos, next.indent);
      } else {
        result[key] = null;
      }
    } else {
      const inline = parseInlineValue(split.value, lines, pos, indent);
      pos.index += inline.consumed;
      result[key] = inline.value;
    }
  }

  return result;
}

function parseSequence(
  lines: YnabSpecLine[],
  pos: YnabSpecPos,
  indent: number,
): YnabSpecValue[] {
  const result: YnabSpecValue[] = [];

  while (pos.index < lines.length) {
    const line = lines[pos.index];

    if (
      line === undefined ||
      line.indent !== indent ||
      !isDashItem(line.text)
    ) {
      break;
    }

    const itemText = line.text === "-" ? "" : line.text.slice(2).trim();

    if (itemText === "") {
      pos.index += 1;
      const next = lines[pos.index];

      if (next !== undefined && next.indent > indent) {
        result.push(parseBlock(lines, pos, next.indent));
      } else {
        result.push(null);
      }
      continue;
    }

    if (splitKey(itemText) !== null) {
      // Inline mapping start (`- key: value`): re-parse this line as the
      // first entry of a mapping indented past the dash. The rewrite happens
      // on a local copy so the shared `lines` array is never mutated.
      const itemLines = lines.slice();
      itemLines[pos.index] = { indent: indent + 2, text: itemText };
      const itemPos: YnabSpecPos = { index: pos.index };
      result.push(parseMapping(itemLines, itemPos, indent + 2));
      pos.index = itemPos.index;
      continue;
    }

    pos.index += 1;
    const inline = parseInlineValue(itemText, lines, pos, indent);
    pos.index += inline.consumed;
    result.push(inline.value);
  }

  return result;
}
