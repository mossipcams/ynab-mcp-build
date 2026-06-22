type SyncDiagnosticsDependencies = {
  createReadModelIntegrity(database: D1Database): {
    getDiagnostics(input: { month?: string; planId: string }): Promise<unknown>;
  };
};

type ExecuteSyncDiagnosticsInput = {
  args: readonly string[];
  database: D1Database | undefined;
  dependencies: SyncDiagnosticsDependencies;
};

function getFlagValue(args: readonly string[], flag: string) {
  const index = args.indexOf(flag);

  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];

  return value && !value.startsWith("--") ? value : undefined;
}

export async function executeSyncDiagnostics(
  input: ExecuteSyncDiagnosticsInput,
) {
  const planId = getFlagValue(input.args, "--plan-id")?.trim();
  const month = getFlagValue(input.args, "--month")?.trim();

  if (!planId) {
    throw new Error("Sync diagnostics requires --plan-id.");
  }

  if (!input.database) {
    throw new Error("YNAB_DB binding is required for sync diagnostics.");
  }

  const integrity = input.dependencies.createReadModelIntegrity(input.database);

  return integrity.getDiagnostics({
    ...(month ? { month } : {}),
    planId,
  });
}
