import { describe, expect, it } from "vitest";

import {
  YnabAccountsResponseSchema,
  YnabCategoriesResponseSchema,
  YnabPlansResponseSchema,
  YnabScheduledTransactionsResponseSchema,
  YnabTransactionsResponseSchema
} from "../../../src/platform/ynab/schemas.js";
import { readYnabFixture } from "./fixtures.js";

describe("ynab schema canaries", () => {
  it("parses the current plans response fixture", () => {
    // DEFECT: tests can drift behind the published YNAB response schema and stop catching API-shape regressions.
    expect(() => YnabPlansResponseSchema.parse(readYnabFixture("plans-response.json"))).not.toThrow();
  });

  it("parses the current accounts response fixture with additive formatted/currency fields", () => {
    // DEFECT: additive amount presentation fields from YNAB can break schema checks even though they are part of the current response shape.
    expect(() => YnabAccountsResponseSchema.parse(readYnabFixture("accounts-response.json"))).not.toThrow();
  });

  it("parses the current categories response fixture with goal rollover fields", () => {
    // DEFECT: category schema tests can miss newly documented target and rollover fields and silently go stale.
    expect(() => YnabCategoriesResponseSchema.parse(readYnabFixture("categories-response.json"))).not.toThrow();
  });

  it("parses the current transactions response fixture with additive formatted/currency fields", () => {
    // DEFECT: transaction schema tests can reject the latest documented money presentation fields from the upstream API.
    expect(() => YnabTransactionsResponseSchema.parse(readYnabFixture("transactions-response.json"))).not.toThrow();
  });

  it("parses the current scheduled transactions fixture with additive subtransaction names", () => {
    // DEFECT: scheduled transaction fixtures can miss newer subtransaction naming fields and stop representing the live API.
    expect(() =>
      YnabScheduledTransactionsResponseSchema.parse(readYnabFixture("scheduled-transactions-response.json"))
    ).not.toThrow();
  });
});
