import { z } from "zod";
import { describe, expect, it } from "vitest";

import { defineTool } from "./tool-definition.js";

describe("defineTool", () => {
  it("keeps the tool shape while inferring handler input from the Zod schema", () => {
    // DEFECT: slice tool schemas and handlers can drift apart when handler input is typed separately.
    const tool = defineTool({
      name: "ynab_get_example",
      title: "Example",
      description: "Example tool",
      inputSchema: {
        accountId: z.string().min(1),
        includeClosed: z.boolean().optional()
      },
      execute(input) {
        const accountId: string = input.accountId;
        const includeClosed: boolean | undefined = input.includeClosed;

        return {
          accountId,
          includeClosed
        };
      }
    });

    expect(tool.name).toBe("ynab_get_example");
    expect(z.object(tool.inputSchema).parse({ accountId: "account-1" })).toEqual({
      accountId: "account-1"
    });
  });

  it("supports tools without input fields", () => {
    const tool = defineTool({
      name: "ynab_get_empty_example",
      title: "Empty Example",
      description: "Example tool without inputs",
      inputSchema: {},
      execute(input) {
        expect(input).toEqual({});

        return {};
      }
    });

    expect(z.object(tool.inputSchema).parse({ extra: true })).toEqual({});
  });
});
