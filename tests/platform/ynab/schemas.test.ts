import { describe, expect, it } from "vitest";

import {
  YnabAccountsResponseSchema,
  YnabCategoriesResponseSchema,
  YnabPlansResponseSchema,
  YnabScheduledTransactionsResponseSchema,
  YnabTransactionsResponseSchema,
} from "../../../src/platform/ynab/schemas.js";
import { readYnabFixture } from "./fixtures.js";

function cloneFixture<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("ynab schema canaries", () => {
  it("parses the current plans response fixture", () => {
    // DEFECT: tests can drift behind the published YNAB response schema and stop catching API-shape regressions.
    const parsed = YnabPlansResponseSchema.parse(
      readYnabFixture("plans-response.json"),
    );

    expect(parsed.data.plans).toEqual([
      {
        id: "plan-1",
        name: "Household",
        last_modified_on: "2026-04-20T12:34:56Z",
      },
    ]);
    expect(parsed.data.default_plan).toEqual({
      id: "plan-1",
      name: "Household",
    });
  });

  it("parses the current accounts response fixture with additive formatted/currency fields", () => {
    // DEFECT: additive amount presentation fields from YNAB can break schema checks even though they are part of the current response shape.
    const parsed = YnabAccountsResponseSchema.parse(
      readYnabFixture("accounts-response.json"),
    );

    expect(parsed.data.accounts).toEqual([
      expect.objectContaining({
        id: "account-1",
        name: "Checking",
        type: "checking",
        closed: false,
        deleted: false,
        balance: 123450,
        balance_formatted: "$123.45",
        balance_currency: 123.45,
        on_budget: true,
        note: null,
      }),
    ]);
  });

  it("parses the current categories response fixture with goal rollover fields", () => {
    // DEFECT: category schema tests can miss newly documented target and rollover fields and silently go stale.
    const parsed = YnabCategoriesResponseSchema.parse(
      readYnabFixture("categories-response.json"),
    );

    expect(parsed.data.category_groups).toEqual([
      {
        id: "group-1",
        name: "Immediate Obligations",
        hidden: false,
        deleted: false,
        categories: [
          {
            id: "category-1",
            name: "Rent",
            hidden: false,
            deleted: false,
            category_group_name: "Immediate Obligations",
            goal_type: "NEED",
            goal_target: 1500000,
            goal_target_date: "2026-05-01",
            goal_needs_whole_amount: true,
            goal_snoozed_at: null,
          },
        ],
      },
    ]);
  });

  it("parses the current transactions response fixture with additive formatted/currency fields", () => {
    // DEFECT: transaction schema tests can reject the latest documented money presentation fields from the upstream API.
    const parsed = YnabTransactionsResponseSchema.parse(
      readYnabFixture("transactions-response.json"),
    );

    expect(parsed.data.transactions).toEqual([
      {
        id: "txn-1",
        date: "2026-04-01",
        amount: -4560,
        amount_formatted: "-$4.56",
        amount_currency: -4.56,
        memo: null,
        cleared: "cleared",
        approved: true,
        flag_name: null,
        account_id: "account-1",
        account_name: "Checking",
        payee_id: "payee-1",
        payee_name: "Coffee Shop",
        category_id: "category-1",
        category_name: "Dining Out",
        transfer_account_id: null,
        deleted: false,
      },
    ]);
  });

  it("parses the current scheduled transactions fixture with additive subtransaction names", () => {
    // DEFECT: scheduled transaction fixtures can miss newer subtransaction naming fields and stop representing the live API.
    const parsed = YnabScheduledTransactionsResponseSchema.parse(
      readYnabFixture("scheduled-transactions-response.json"),
    );

    expect(parsed.data.scheduled_transactions).toEqual([
      {
        id: "scheduled-1",
        date_first: "2026-04-01",
        date_next: "2026-05-01",
        frequency: "monthly",
        amount: -120000,
        amount_formatted: "-$120.00",
        amount_currency: -120,
        payee_name: "Internet Provider",
        category_name: "Utilities",
        account_name: "Checking",
        deleted: false,
        subtransactions: [
          {
            id: "sub-1",
            amount: -60000,
            payee_name: "Internet",
            category_name: "Utilities",
          },
        ],
      },
    ]);
  });

  it("rejects plans fixtures when required plan identifiers are missing", () => {
    // DEFECT: an over-permissive plans schema can silently accept malformed plan summaries and hide upstream contract drift.
    const fixture = cloneFixture(readYnabFixture("plans-response.json"));
    delete fixture.data.plans[0].id;

    expect(() => YnabPlansResponseSchema.parse(fixture)).toThrow();
  });

  it("rejects accounts fixtures when balance metadata has the wrong types", () => {
    // DEFECT: account schema checks can loosen enough to accept malformed numeric and formatted balance fields.
    const fixture = cloneFixture(readYnabFixture("accounts-response.json"));
    fixture.data.accounts[0].balance = "123450";
    fixture.data.accounts[0].balance_currency = "123.45";
    fixture.data.accounts[0].closed = "false";

    expect(() => YnabAccountsResponseSchema.parse(fixture)).toThrow();
  });

  it("rejects categories fixtures when category groups lose their category arrays", () => {
    // DEFECT: category group validation can degrade and stop enforcing the nested categories collection shape.
    const fixture = cloneFixture(readYnabFixture("categories-response.json"));
    fixture.data.category_groups[0].categories = "not-an-array";

    expect(() => YnabCategoriesResponseSchema.parse(fixture)).toThrow();
  });

  it("rejects transactions fixtures when the transaction payload loses required typed fields", () => {
    // DEFECT: transaction schema validation can weaken and start accepting malformed dates, amounts, or approval flags.
    const fixture = cloneFixture(readYnabFixture("transactions-response.json"));
    fixture.data.transactions[0].date = 20260401;
    fixture.data.transactions[0].amount = "-4560";
    fixture.data.transactions[0].approved = "yes";

    expect(() => YnabTransactionsResponseSchema.parse(fixture)).toThrow();
  });

  it("rejects scheduled transaction fixtures when subtransactions stop matching the documented shape", () => {
    // DEFECT: scheduled transaction validation can stop enforcing the nested subtransaction contract and miss upstream regressions.
    const fixture = cloneFixture(
      readYnabFixture("scheduled-transactions-response.json"),
    );
    fixture.data.scheduled_transactions[0].subtransactions = [
      {
        id: "sub-1",
        amount: "-60000",
      },
    ];

    expect(() =>
      YnabScheduledTransactionsResponseSchema.parse(fixture),
    ).toThrow();
  });
});
