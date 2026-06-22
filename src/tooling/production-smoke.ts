type SmokeEnv = {
  MCP_PUBLIC_URL?: string;
  MCP_SMOKE_AUTH_TOKEN?: string;
  MCP_SMOKE_MONTH?: string;
  MCP_SMOKE_URL?: string;
};

type SmokeToolClient = {
  callTool(name: string, input: Record<string, unknown>): Promise<unknown>;
};

type ExecuteProductionSmokeInput = {
  args: readonly string[];
  client?: SmokeToolClient;
  env: SmokeEnv;
};

type CreateMcpHttpSmokeClientInput = {
  fetchFn?: typeof fetch;
  token?: string;
  url: string;
};

function getFlagValue(args: readonly string[], flag: string) {
  const index = args.indexOf(flag);

  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];

  return value && !value.startsWith("--") ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getRecord(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined;
  }

  const child = value[key];

  return isRecord(child) ? child : undefined;
}

function getString(value: unknown, key: string) {
  if (!isRecord(value)) {
    return undefined;
  }

  const child = value[key];

  return typeof child === "string" ? child : undefined;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function getArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }

  const child = value[key];

  return isUnknownArray(child) ? child : [];
}

function parseJsonObject(text: string) {
  const parsed: unknown = JSON.parse(text);

  return parsed;
}

function unwrapToolResult(payload: unknown) {
  if (isRecord(payload) && isRecord(payload.structuredContent)) {
    return payload.structuredContent;
  }

  const result = getRecord(payload, "result");
  if (result) {
    return unwrapToolResult(result);
  }

  const content = getArray(payload, "content");
  const firstContent = content[0];

  if (isRecord(firstContent)) {
    const text = getString(firstContent, "text");

    if (text) {
      return parseJsonObject(text);
    }
  }

  return payload;
}

function requireOkToolData(toolName: string, payload: unknown) {
  const result = unwrapToolResult(payload);
  const status = getString(result, "status");

  if (status && status !== "ok" && status !== "stale") {
    const warning = getRecord(result, "data_freshness")?.warning;
    const message =
      typeof warning === "string"
        ? warning
        : `${toolName} returned status ${status}.`;

    throw new Error(message);
  }

  const data = isRecord(result) ? result.data : undefined;

  if (data === null || data === undefined) {
    throw new Error(`${toolName} did not return data.`);
  }

  return data;
}

function findFirstCategoryId(spendingSummaryData: unknown) {
  const topCategories = getArray(spendingSummaryData, "top_categories");

  for (const category of topCategories) {
    const id = getString(category, "id");

    if (id) {
      return id;
    }
  }

  return null;
}

function getMonthCategoryCount(monthData: unknown) {
  const month = getRecord(monthData, "month");
  const categoryCount = month?.category_count;

  return typeof categoryCount === "number" ? categoryCount : 0;
}

export function createMcpHttpSmokeClient(input: CreateMcpHttpSmokeClientInput) {
  const fetchFn = input.fetchFn ?? fetch;

  return {
    async callTool(name: string, toolInput: Record<string, unknown>) {
      const headers = new Headers({
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      });

      if (input.token) {
        headers.set("authorization", `Bearer ${input.token}`);
      }

      const response = await fetchFn(input.url, {
        body: JSON.stringify({
          id: `smoke-${name}`,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: toolInput,
            name,
          },
        }),
        headers,
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(
          `${name} smoke call failed with HTTP ${response.status}.`,
        );
      }

      const payload: unknown = await response.json();

      if (isRecord(payload) && payload.error) {
        throw new Error(`${name} smoke call returned a JSON-RPC error.`);
      }

      return payload;
    },
  };
}

export async function executeProductionSmoke(
  input: ExecuteProductionSmokeInput,
) {
  const url = input.env.MCP_SMOKE_URL ?? input.env.MCP_PUBLIC_URL;
  const month =
    getFlagValue(input.args, "--month") ?? input.env.MCP_SMOKE_MONTH;

  if (!url || !month) {
    throw new Error(
      "Production smoke requires MCP_SMOKE_URL or MCP_PUBLIC_URL, and MCP_SMOKE_MONTH or --month.",
    );
  }

  const client =
    input.client ??
    createMcpHttpSmokeClient({
      ...(input.env.MCP_SMOKE_AUTH_TOKEN
        ? { token: input.env.MCP_SMOKE_AUTH_TOKEN }
        : {}),
      url,
    });
  const spendingSummary = requireOkToolData(
    "ynab_get_spending_summary",
    await client.callTool("ynab_get_spending_summary", {
      detailLevel: "detailed",
      fromMonth: month,
      toMonth: month,
      topN: 10,
    }),
  );
  const categoryId = findFirstCategoryId(spendingSummary);

  if (categoryId) {
    requireOkToolData(
      "ynab_get_category",
      await client.callTool("ynab_get_category", {
        categoryId,
        month,
      }),
    );
  }

  const budgetHealth = requireOkToolData(
    "ynab_get_budget_health_summary",
    await client.callTool("ynab_get_budget_health_summary", { month }),
  );
  const overspentTotal = getString(budgetHealth, "overspent_total") ?? null;
  const monthDetail = requireOkToolData(
    "ynab_get_month",
    await client.callTool("ynab_get_month", { month }),
  );
  const monthCategoryCount = getMonthCategoryCount(monthDetail);

  if (overspentTotal === "0.00" && monthCategoryCount === 0) {
    throw new Error(
      "Budget health reported zero overspent while month category_count is 0.",
    );
  }

  return {
    categoryChecked: categoryId,
    month,
    monthCategoryCount,
    overspentTotal,
    status: "ok",
  };
}
