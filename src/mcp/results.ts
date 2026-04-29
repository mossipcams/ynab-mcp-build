function sanitizeErrorMessage(message: string) {
  return message
    .replace(/(Authorization:\s*Bearer\s+)([^\s",]+)/giu, "$1[REDACTED]")
    .replace(
      /\b(JWT_SIGNING_KEY|YNAB_ACCESS_TOKEN|YNAB_PAT)\s*=\s*([^\s",]+)/giu,
      "$1=[REDACTED]",
    );
}

function toStructuredContent(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }

  return { value: payload };
}

export function toTextResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload),
      },
    ],
    isError: false,
    structuredContent: toStructuredContent(payload),
  };
}

export function toErrorResult(error: unknown) {
  const result = toTextResult({
    success: false,
    error: sanitizeErrorMessage(
      error instanceof Error ? error.message : String(error),
    ),
  });

  return {
    ...result,
    isError: true,
  };
}
