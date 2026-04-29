import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  amountFilterSchema,
  clearedStatusSchema,
  dateFieldSchema,
  fieldProjectionSchema,
  includeIdsSchema,
  monthFieldSchema,
  monthSelectorSchema,
  paginationSchema,
  planIdSchema,
  requiredIdSchema,
} from "./tool-inputs.js";

describe("shared tool input schemas", () => {
  it("keeps common pagination tool inputs bounded", () => {
    // DEFECT: duplicated pagination schemas can drift to allow unbounded page sizes or negative offsets.
    const schema = z.object({
      ...planIdSchema,
      ...paginationSchema,
    });

    expect(schema.parse({ planId: "plan-1", limit: 500, offset: 0 })).toEqual({
      planId: "plan-1",
      limit: 500,
      offset: 0,
    });
    expect(() => schema.parse({ limit: 501 })).toThrow();
    expect(() => schema.parse({ offset: -1 })).toThrow();
  });

  it("keeps field projection values limited to the selected enum", () => {
    // DEFECT: duplicated projection schemas can drift to accept fields that the service layer does not project.
    const schema = z.object({
      fields: fieldProjectionSchema(["name", "balance"] as const),
      ...includeIdsSchema,
    });

    expect(schema.parse({ fields: ["name"], includeIds: true })).toEqual({
      fields: ["name"],
      includeIds: true,
    });
    expect(() => schema.parse({ fields: ["memo"] })).toThrow();
  });

  it("keeps required identifiers non-empty", () => {
    // DEFECT: hand-written identifier schemas can accidentally accept empty IDs.
    const schema = z.object({
      transactionId: requiredIdSchema,
    });

    expect(schema.parse({ transactionId: "tx-1" })).toEqual({
      transactionId: "tx-1",
    });
    expect(() => schema.parse({ transactionId: "" })).toThrow();
  });

  it("keeps required YNAB months in first-of-month ISO format", () => {
    // DEFECT: hand-written month schemas can accidentally accept malformed YNAB month selectors.
    const schema = z.object({
      month: monthFieldSchema,
    });

    expect(schema.parse({ month: "2026-04-01" })).toEqual({
      month: "2026-04-01",
    });
    expect(() => schema.parse({ month: "" })).toThrow();
    expect(() => schema.parse({ month: "2026-04" })).toThrow();
    expect(() => schema.parse({ month: "2026-04-02" })).toThrow();
  });

  it("keeps YNAB date filters in ISO date format", () => {
    // DEFECT: hand-written date filter schemas can accidentally accept malformed YNAB date filters.
    const schema = z.object({
      fromDate: dateFieldSchema.optional(),
    });

    expect(schema.parse({ fromDate: "2026-04-01" })).toEqual({
      fromDate: "2026-04-01",
    });
    expect(() => schema.parse({ fromDate: "04/01/2026" })).toThrow();
  });

  it("accepts current only for month selectors that resolve relative to the latest budget month", () => {
    // DEFECT: broad month schemas can reject the documented current selector or accept it for raw YNAB month endpoints.
    expect(monthSelectorSchema.parse("current")).toBe("current");
    expect(monthSelectorSchema.parse("2026-04-01")).toBe("2026-04-01");
    expect(() => monthFieldSchema.parse("current")).toThrow();
  });

  it("keeps transaction cleared status filters limited to YNAB values", () => {
    // DEFECT: broad cleared filters can silently query impossible transaction states.
    expect(clearedStatusSchema.parse("cleared")).toBe("cleared");
    expect(clearedStatusSchema.parse("uncleared")).toBe("uncleared");
    expect(clearedStatusSchema.parse("reconciled")).toBe("reconciled");
    expect(() => clearedStatusSchema.parse("pending")).toThrow();
  });

  it("rejects non-finite amount filters", () => {
    // DEFECT: amount filters can accept NaN or Infinity values that cannot safely map to API or DB filters.
    expect(amountFilterSchema.parse(12.34)).toBe(12.34);
    expect(() => amountFilterSchema.parse(Number.NaN)).toThrow();
    expect(() => amountFilterSchema.parse(Number.POSITIVE_INFINITY)).toThrow();
  });
});
