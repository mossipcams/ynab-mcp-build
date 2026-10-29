import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  dollarsToMilliunits,
  mapTransactionRecord,
  milliunitsToDollars,
  sumSubtransactionAmounts,
} from "./mappers.js";

describe("ynab mapper calculation helpers", () => {
  it("round-trips generated integer milliunits through dollar conversion", () => {
    // DEFECT: mapper conversions can drift when integer milliunits cross dollar-shaped boundaries.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (milliunits) => {
          expect(dollarsToMilliunits(milliunitsToDollars(milliunits))).toBe(
            milliunits,
          );
        },
      ),
    );
  });

  it("rounds generated dollar amounts to the nearest milliunit", () => {
    // DEFECT: fractional dollar amounts can be truncated or rounded at cent precision before reaching YNAB milliunits.
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        (thousandthsOfADollar) => {
          const amount = thousandthsOfADollar / 1000;

          expect(dollarsToMilliunits(amount)).toBe(thousandthsOfADollar);
        },
      ),
    );
  });

  it("sums generated subtransaction milliunits independently of order", () => {
    // DEFECT: split transaction totals can become order-sensitive or drop negative subtransactions.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), {
          minLength: 1,
          maxLength: 50,
        }),
        (amounts) => {
          const expected = amounts.reduce((sum, amount) => sum + amount, 0);
          const forward = sumSubtransactionAmounts(
            amounts.map((amount) => ({ amount })),
          );
          const backward = sumSubtransactionAmounts(
            amounts
              .slice()
              .reverse()
              .map((amount) => ({ amount })),
          );

          expect(forward).toBe(expected);
          expect(backward).toBe(expected);
        },
      ),
    );
  });
});

describe("matched transaction pairs", () => {
  it("hides the import half of a YNAB matched pair and keeps the visible half", () => {
    // DEFECT: both halves of a matched pair were counted, doubling rent/MLGW charges YNAB shows once.
    const visible = mapTransactionRecord({
      id: "8779293e-5d27-4674-87ab-c4553d8e7a1e_2026-10-01",
      date: "2026-10-01",
      amount: -1_550_000,
      matched_transaction_id: "5c391947-f8a4-4069-9b28-5a5bccb446f9",
      import_id: "YNAB:-1550000:2026-10-02:1",
      import_payee_name: "Red Maple Realtors",
      deleted: false,
    });
    const hidden = mapTransactionRecord({
      id: "5c391947-f8a4-4069-9b28-5a5bccb446f9",
      date: "2026-10-02",
      amount: -1_550_000,
      matched_transaction_id: "8779293e-5d27-4674-87ab-c4553d8e7a1e_2026-10-01",
      import_id: "YNAB:-1550000:2026-10-02:1",
      import_payee_name:
        '{"importedPayee":"Red Maple Realtors","source":"Scheduler","importedSource":"Imported","accepted":true}',
      deleted: false,
    });

    expect(visible.deleted).toBe(false);
    expect(hidden.deleted).toBe(true);
  });
});
