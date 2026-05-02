import { describe, expect, it } from "vitest";

import { runD1Batches } from "./d1-batch.js";

describe("D1 batch helper", () => {
  it("chunks writes, runs them with bounded concurrency, and waits for every batch", async () => {
    const batchCalls: D1PreparedStatement[][] = [];
    const pendingBatches: Array<{ resolve: () => void }> = [];
    let activeBatchCount = 0;
    let maxActiveBatchCount = 0;

    const database = {
      batch(statements: D1PreparedStatement[]) {
        batchCalls.push(statements);
        activeBatchCount += 1;
        maxActiveBatchCount = Math.max(maxActiveBatchCount, activeBatchCount);

        return new Promise<D1Result[]>((resolve) => {
          pendingBatches.push({
            resolve: () => {
              activeBatchCount -= 1;
              resolve([]);
            },
          });
        });
      },
      // This fake only exercises database.batch, which is the helper boundary under test.
    } as D1Database;
    const statements = Array.from({ length: 7 }, (_entry, index) => ({
      index,
      // These fake statements are passed through to database.batch and are never executed directly.
    })) as unknown as D1PreparedStatement[];

    const result = runD1Batches(database, statements, {
      batchSize: 2,
      concurrency: 2,
    });

    await Promise.resolve();

    expect(batchCalls.map((batch) => batch.length)).toEqual([2, 2]);
    expect(maxActiveBatchCount).toBe(2);

    pendingBatches[0]?.resolve();
    await Promise.resolve();

    expect(batchCalls.map((batch) => batch.length)).toEqual([2, 2, 2]);
    expect(maxActiveBatchCount).toBe(2);

    pendingBatches[1]?.resolve();
    pendingBatches[2]?.resolve();
    await Promise.resolve();

    expect(batchCalls.map((batch) => batch.length)).toEqual([2, 2, 2, 1]);

    pendingBatches[3]?.resolve();
    await expect(result).resolves.toBeUndefined();
    expect(maxActiveBatchCount).toBe(2);
  });

  it("waits for in-flight batches and stops scheduling new chunks before surfacing a failure", async () => {
    // DEFECT: a rejected D1 batch can return to sync failure handling while other batches still mutate D1.
    const batchCalls: D1PreparedStatement[][] = [];
    const pendingBatches: Array<{
      reject: (error: unknown) => void;
      resolve: () => void;
    }> = [];
    let settled: "rejected" | "resolved" | undefined;

    const database = {
      batch(statements: D1PreparedStatement[]) {
        batchCalls.push(statements);

        return new Promise<D1Result[]>((resolve, reject) => {
          pendingBatches.push({
            reject,
            resolve: () => resolve([]),
          });
        });
      },
    } as D1Database;
    const statements = Array.from({ length: 4 }, (_entry, index) => ({
      index,
    })) as unknown as D1PreparedStatement[];
    const failure = new Error("D1 batch failed");

    const result = runD1Batches(database, statements, {
      batchSize: 1,
      concurrency: 2,
    }).then(
      () => {
        settled = "resolved";
      },
      (error: unknown) => {
        settled = "rejected";
        throw error;
      },
    );

    await Promise.resolve();

    expect(batchCalls).toHaveLength(2);

    pendingBatches[0]?.reject(failure);
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBeUndefined();
    expect(batchCalls).toHaveLength(2);

    pendingBatches[1]?.resolve();

    await expect(result).rejects.toThrow("D1 batch failed");
    expect(batchCalls).toHaveLength(2);
    expect(settled).toBe("rejected");
  });
});
