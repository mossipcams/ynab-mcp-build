import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  dollarsToMilliunits,
  filterActiveTransactions,
  mapTransactionRecord,
  milliunitsToDollars,
  sumSubtransactionAmounts
} from "../../../src/platform/ynab/mappers.js";

describe("ynab mappers", () => {
  it("round-trips integer dollar amounts through milliunits", () => {
    // DEFECT: amount conversion can drift and silently corrupt balances when values cross mapper boundaries.
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }), (amount) => {
        expect(milliunitsToDollars(dollarsToMilliunits(amount))).toBe(amount);
      })
    );
  });

  it("sums subtransaction amounts exactly to the parent total regardless of order", () => {
    // DEFECT: subtransaction aggregation can become order-sensitive and break split-transaction accounting.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), { minLength: 1, maxLength: 20 }),
        (amounts) => {
          const forward = sumSubtransactionAmounts(amounts.map((amount) => ({ amount })));
          const reversed = sumSubtransactionAmounts([...amounts].reverse().map((amount) => ({ amount })));

          expect(forward).toBe(amounts.reduce((sum, amount) => sum + amount, 0));
          expect(reversed).toBe(forward);
        }
      )
    );
  });

  it("filters deleted transactions from active query results", () => {
    // DEFECT: deleted YNAB records can leak into normal results and cause duplicate or phantom activity.
    const transactions = filterActiveTransactions([
      mapTransactionRecord({
        id: "txn-active",
        date: "2026-04-01",
        amount: -1000,
        deleted: false
      }),
      mapTransactionRecord({
        id: "txn-deleted",
        date: "2026-04-02",
        amount: -2000,
        deleted: true
      })
    ]);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.id).toBe("txn-active");
  });

  it("marks transfer transactions explicitly when transfer_account_id is present", () => {
    // DEFECT: transfer activity can be misclassified as ordinary spending when mapper output drops the transfer marker.
    const transaction = mapTransactionRecord({
      id: "txn-transfer",
      date: "2026-04-03",
      amount: -5000,
      deleted: false,
      transfer_account_id: "account-savings"
    });

    expect(transaction.transferAccountId).toBe("account-savings");
    expect(transaction.isTransfer).toBe(true);
  });
});
