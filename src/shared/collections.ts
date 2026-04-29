import { compactObject } from "./object.js";

type ProjectionOptions<FieldName extends string> = {
  fields?: readonly FieldName[];
  includeIds?: boolean;
};

type PaginationOptions = {
  limit?: number;
  offset?: number;
};

type CollectionOptions<FieldName extends string> =
  ProjectionOptions<FieldName> & PaginationOptions;
type CollectionEntry = Record<string, unknown> & { id?: string };

export const DEFAULT_LIMIT = 65;

function normalizeNumber(
  value: number | undefined,
  fallback: number,
  minimum: number,
) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(Math.trunc(value), minimum);
}

export function formatAmountMilliunits(value: number) {
  return (value / 1000).toFixed(2);
}

export function hasProjectionControls<FieldName extends string>(
  options: CollectionOptions<FieldName>,
) {
  return Boolean(options.fields?.length) || options.includeIds === false;
}

export function hasPaginationControls<FieldName extends string>(
  options: CollectionOptions<FieldName>,
) {
  return options.limit !== undefined || options.offset !== undefined;
}

export function projectRecord<FieldName extends string>(
  entry: CollectionEntry,
  allFields: readonly FieldName[],
  options: ProjectionOptions<FieldName> = {},
) {
  const requestedFields = options.fields?.length ? options.fields : allFields;
  const projected = Object.fromEntries(
    requestedFields
      .filter((field) => field in entry)
      .map((field) => [field, entry[field]]),
  );

  if (options.includeIds !== false && entry.id !== undefined) {
    projected.id = entry.id;
  }

  return compactObject(projected);
}

export function paginateEntries<Entry>(
  entries: Entry[],
  options: PaginationOptions = {},
) {
  const limit = normalizeNumber(options.limit, DEFAULT_LIMIT, 1);
  const offset = normalizeNumber(options.offset, 0, 0);
  const pagedEntries = entries.slice(offset, offset + limit);

  return {
    entries: pagedEntries,
    metadata: {
      limit,
      offset,
      returned_count: pagedEntries.length,
      has_more: offset + pagedEntries.length < entries.length,
    },
  };
}

export function shouldPaginateEntries<FieldName extends string, Entry>(
  entries: Entry[],
  options: CollectionOptions<FieldName>,
) {
  return hasPaginationControls(options) || entries.length > DEFAULT_LIMIT;
}
