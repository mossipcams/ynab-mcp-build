import type { z } from "zod";

type ZodRawShape = Record<string, z.ZodTypeAny>;

type OptionalKeys<TInput> = {
  [TKey in keyof TInput]-?: Record<string, never> extends Pick<TInput, TKey>
    ? TKey
    : never;
}[keyof TInput];

type RequiredKeys<TInput> = Exclude<keyof TInput, OptionalKeys<TInput>>;

type ExactOptionalInput<TInput> = {
  [TKey in RequiredKeys<TInput>]: TInput[TKey];
} & {
  [TKey in OptionalKeys<TInput>]?: Exclude<TInput[TKey], undefined>;
};

type InferShapeInput<TShape extends ZodRawShape> = ExactOptionalInput<
  z.infer<z.ZodObject<TShape>>
>;

export type SliceToolDefinition<TInput = never, TOutput = unknown> = {
  description: string;
  execute(input: TInput): Promise<TOutput> | TOutput;
  inputSchema: ZodRawShape;
  name: string;
  title: string;
};

export function defineTool<TShape extends ZodRawShape, TOutput>(
  definition: Omit<
    SliceToolDefinition<InferShapeInput<TShape>, TOutput>,
    "inputSchema"
  > & {
    inputSchema: TShape;
  },
): SliceToolDefinition<InferShapeInput<TShape>, TOutput> & {
  inputSchema: TShape;
} {
  return definition;
}
