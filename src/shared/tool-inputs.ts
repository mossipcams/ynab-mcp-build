import { z } from "zod";

type EnumValues = readonly [string, ...string[]];

export const planIdSchema = {
  planId: z.string().optional()
};

export const paginationSchema = {
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional()
};

export const includeIdsSchema = {
  includeIds: z.boolean().optional()
};

export const requiredIdSchema = z.string().min(1);

export const monthFieldSchema = z.string().regex(/^\d{4}-\d{2}-01$/);

export const monthSelectorSchema = z.union([z.literal("current"), monthFieldSchema]);

export const requiredMonthSchema = monthFieldSchema;

export const dateFieldSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const clearedStatusSchema = z.enum(["cleared", "uncleared", "reconciled"]);

export const amountFilterSchema = z.number().finite();

export const fieldProjectionSchema = <TFields extends EnumValues>(fields: TFields) => z.array(z.enum(fields)).optional();

export const paginatedProjectionSchema = <TFields extends EnumValues>(fields: TFields) => ({
  ...planIdSchema,
  ...paginationSchema,
  fields: fieldProjectionSchema(fields),
  ...includeIdsSchema
});
