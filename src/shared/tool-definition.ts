import type { z } from "zod";

export type SliceToolDefinition<TInput = never, TOutput = unknown> = {
  description: string;
  execute(input: TInput): Promise<TOutput> | TOutput;
  inputSchema: Record<string, z.ZodTypeAny>;
  name: string;
  title: string;
};
