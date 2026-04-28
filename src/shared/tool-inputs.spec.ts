import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  dateFieldSchema,
  fieldProjectionSchema,
  includeIdsSchema,
  paginationSchema,
  planIdSchema,
  requiredIdSchema,
  requiredMonthSchema
} from "./tool-inputs.js";

describe("shared tool input schemas", () => {
  it("keeps common pagination tool inputs bounded", () => {
    // DEFECT: duplicated pagination schemas can drift to allow unbounded page sizes or negative offsets.
    const schema = z.object({
      ...planIdSchema,
      ...paginationSchema
    });

    expect(schema.parse({ planId: "plan-1", limit: 500, offset: 0 })).toEqual({
      planId: "plan-1",
      limit: 500,
      offset: 0
    });
    expect(() => schema.parse({ limit: 501 })).toThrow();
    expect(() => schema.parse({ offset: -1 })).toThrow();
  });

  it("keeps field projection values limited to the selected enum", () => {
    // DEFECT: duplicated projection schemas can drift to accept fields that the service layer does not project.
    const schema = z.object({
      fields: fieldProjectionSchema(["name", "balance"] as const),
      ...includeIdsSchema
    });

    expect(schema.parse({ fields: ["name"], includeIds: true })).toEqual({
      fields: ["name"],
      includeIds: true
    });
    expect(() => schema.parse({ fields: ["memo"] })).toThrow();
  });

  it("keeps required identifiers non-empty", () => {
    // DEFECT: hand-written identifier schemas can accidentally accept empty IDs.
    const schema = z.object({
      transactionId: requiredIdSchema
    });

    expect(schema.parse({ transactionId: "tx-1" })).toEqual({ transactionId: "tx-1" });
    expect(() => schema.parse({ transactionId: "" })).toThrow();
  });

  it("keeps required months non-empty", () => {
    // DEFECT: hand-written month schemas can accidentally accept empty month selectors.
    const schema = z.object({
      month: requiredMonthSchema
    });

    expect(schema.parse({ month: "2026-04-01" })).toEqual({ month: "2026-04-01" });
    expect(() => schema.parse({ month: "" })).toThrow();
  });

  it("keeps YNAB date filters in ISO date format", () => {
    // DEFECT: hand-written date filter schemas can accidentally accept malformed YNAB date filters.
    const schema = z.object({
      fromDate: dateFieldSchema.optional()
    });

    expect(schema.parse({ fromDate: "2026-04-01" })).toEqual({ fromDate: "2026-04-01" });
    expect(() => schema.parse({ fromDate: "04/01/2026" })).toThrow();
  });
});
