import { describe, expect, it, vi } from "vitest";

import { executeSyncDiagnostics } from "./sync-diagnostics.js";

describe("sync diagnostics tooling", () => {
  it("requires a plan id before reading D1 diagnostics", async () => {
    const createReadModelIntegrity = vi.fn();

    await expect(
      executeSyncDiagnostics({
        args: [],
        database: {} as D1Database,
        dependencies: { createReadModelIntegrity },
      }),
    ).rejects.toThrow("Sync diagnostics requires --plan-id.");

    expect(createReadModelIntegrity).not.toHaveBeenCalled();
  });

  it("reports read-model integrity diagnostics for a plan and month", async () => {
    const diagnostics = {
      month: {
        categoryRowCount: 8,
        missingMonthCategoryReferenceCount: 2,
        monthCategoryRowCount: 0,
        monthRowCount: 1,
        transactionCategoryReferenceCount: 12,
      },
      nested: {
        missingMoneyMovementGroupReferenceCount: 1,
        missingScheduledSubtransactionParentReferenceCount: 0,
        missingSubtransactionParentReferenceCount: 0,
        moneyMovementGroupRowCount: 0,
        moneyMovementRowCount: 1,
        scheduledSubtransactionRowCount: 0,
        scheduledTransactionRowCount: 3,
        subtransactionRowCount: 4,
        transactionRowCount: 12,
      },
    };
    const getDiagnostics = vi.fn(async () => diagnostics);
    const createReadModelIntegrity = vi.fn(() => ({ getDiagnostics }));
    const database = {} as D1Database;

    await expect(
      executeSyncDiagnostics({
        args: ["--plan-id", "plan-1", "--month", "2026-06-01"],
        database,
        dependencies: { createReadModelIntegrity },
      }),
    ).resolves.toEqual(diagnostics);

    expect(createReadModelIntegrity).toHaveBeenCalledWith(database);
    expect(getDiagnostics).toHaveBeenCalledWith({
      month: "2026-06-01",
      planId: "plan-1",
    });
  });
});
