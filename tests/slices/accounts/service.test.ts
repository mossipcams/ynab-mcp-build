import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { getAccount, listAccounts } from "../../../src/slices/accounts/service.js";
import { getAccountToolDefinitions } from "../../../src/slices/accounts/tools.js";

describe("accounts service", () => {
  it("uses the default plan and filters deleted accounts from list results", async () => {
    // DEFECT: deleted accounts can leak back into list output when plan resolution falls through the default-plan path.
    const ynabClient = {
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 123450
        },
        {
          id: "account-2",
          name: "Closed Account",
          type: "savings",
          closed: true,
          deleted: true,
          balance: 0
        }
      ]),
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      })
    };

    await expect(listAccounts(ynabClient as never, {})).resolves.toEqual({
      accounts: [
        {
          id: "account-1",
          name: "Checking",
          type: "checking",
          closed: false,
          balance: "123.45"
        }
      ],
      account_count: 1
    });
    expect(ynabClient.listPlans).toHaveBeenCalledOnce();
    expect(ynabClient.listAccounts).toHaveBeenCalledWith("plan-1");
  });

  it("applies pagination and projection controls without leaking omitted fields", async () => {
    // DEFECT: collection projection can ignore requested fields and expose unintended account attributes.
    const ynabClient = {
      listAccounts: vi.fn().mockResolvedValue([
        {
          id: "account-1",
          name: "Checking",
          type: "checking",
          closed: false,
          deleted: false,
          balance: 123450
        },
        {
          id: "account-2",
          name: "Savings",
          type: "savings",
          closed: false,
          deleted: false,
          balance: 999000
        }
      ]),
      listPlans: vi.fn()
    };

    await expect(
      listAccounts(ynabClient as never, {
        planId: "plan-1",
        limit: 1,
        offset: 1,
        fields: ["name", "balance"],
        includeIds: false
      })
    ).resolves.toEqual({
      accounts: [
        {
          name: "Savings",
          balance: "999.00"
        }
      ],
      account_count: 2,
      limit: 1,
      offset: 1,
      returned_count: 1,
      has_more: false
    });
    expect(ynabClient.listPlans).not.toHaveBeenCalled();
    expect(ynabClient.listAccounts).toHaveBeenCalledWith("plan-1");
  });

  it("returns a compact single-account summary with formatted balance", async () => {
    // DEFECT: single-account responses can include nullish fields or unformatted milliunit balances and break compact client rendering.
    const ynabClient = {
      getAccount: vi.fn().mockResolvedValue({
        id: "account-1",
        name: "Checking",
        type: "checking",
        onBudget: true,
        closed: false,
        balance: 123450
      }),
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      })
    };

    await expect(
      getAccount(ynabClient as never, {
        accountId: "account-1"
      })
    ).resolves.toEqual({
      account: {
        id: "account-1",
        name: "Checking",
        type: "checking",
        on_budget: true,
        closed: false,
        balance: "123.45"
      }
    });
    expect(ynabClient.getAccount).toHaveBeenCalledWith("plan-1", "account-1");
  });

  it("requires accountId in the account tool schema before executing the handler", async () => {
    // DEFECT: the account tool contract can lose its required accountId field and defer the error until after MCP dispatch.
    const ynabClient = {
      getAccount: vi.fn().mockResolvedValue({
        id: "account-1",
        name: "Checking",
        type: "checking",
        onBudget: true,
        closed: false,
        balance: 123450
      }),
      listAccounts: vi.fn(),
      listPlans: vi.fn().mockResolvedValue({
        plans: [{ id: "plan-1", name: "Household" }],
        defaultPlan: { id: "plan-1", name: "Household" }
      })
    };
    const definitions = getAccountToolDefinitions(ynabClient as never);
    const accountTool = definitions.find((definition) => definition.name === "ynab_get_account");

    expect(accountTool).toBeDefined();
    expect(() => z.object(accountTool?.inputSchema ?? {}).parse({})).toThrow();
    await expect(
      accountTool?.execute({
        accountId: "account-1"
      })
    ).resolves.toEqual({
      account: {
        id: "account-1",
        name: "Checking",
        type: "checking",
        on_budget: true,
        closed: false,
        balance: "123.45"
      }
    });
  });
});
