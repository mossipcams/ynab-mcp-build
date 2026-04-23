function sanitizeErrorMessage(message: string) {
  return message
    .replace(
      /(Authorization:\s*Bearer\s+)([^\s",]+)/giu,
      "$1[REDACTED]"
    )
    .replace(
      /\b(JWT_SIGNING_KEY|YNAB_ACCESS_TOKEN|YNAB_PAT)\s*=\s*([^\s",]+)/giu,
      "$1=[REDACTED]"
    );
}

export function toTextResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload)
      }
    ],
    isError: false
  };
}

export function toErrorResult(error: unknown) {
  const result = toTextResult({
      success: false,
      error: sanitizeErrorMessage(error instanceof Error ? error.message : String(error))
    });

  return {
    ...result,
    isError: true
  };
}
