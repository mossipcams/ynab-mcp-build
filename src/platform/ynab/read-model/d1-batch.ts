const DEFAULT_D1_BATCH_SIZE = 50;
const DEFAULT_D1_BATCH_CONCURRENCY = 4;

export type RunD1BatchesOptions = {
  batchSize?: number;
  concurrency?: number;
};

function toPositiveInteger(value: number | undefined, fallback: number) {
  if (value === undefined || value < 1) {
    return fallback;
  }

  return Math.floor(value);
}

export async function runD1Batches(
  database: D1Database,
  statements: D1PreparedStatement[],
  options: RunD1BatchesOptions = {},
): Promise<void> {
  if (statements.length === 0) {
    return;
  }

  const batchSize = toPositiveInteger(options.batchSize, DEFAULT_D1_BATCH_SIZE);
  const concurrency = toPositiveInteger(
    options.concurrency,
    DEFAULT_D1_BATCH_CONCURRENCY,
  );
  const batches: D1PreparedStatement[][] = [];

  for (let index = 0; index < statements.length; index += batchSize) {
    batches.push(statements.slice(index, index + batchSize));
  }

  let nextBatchIndex = 0;
  const errors: unknown[] = [];
  const state = { hasError: false };
  const runWorker = async () => {
    while (!state.hasError && nextBatchIndex < batches.length) {
      const batch = batches[nextBatchIndex]!;
      nextBatchIndex += 1;

      try {
        await database.batch(batch);
      } catch (error) {
        state.hasError = true;
        errors.push(error);

        return;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () =>
      runWorker(),
    ),
  );

  if (errors.length > 0) {
    throw errors[0];
  }
}
