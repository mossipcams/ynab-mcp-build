import type { z } from "zod";

export type SliceToolDefinition<TInput = any, TOutput = unknown> = {
  description: string;
  execute: (input: TInput) => Promise<TOutput> | TOutput;
  inputSchema: Record<string, z.ZodTypeAny>;
  name: string;
  title: string;
};
