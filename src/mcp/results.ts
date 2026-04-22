export function toMcpTextResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload)
      }
    ]
  };
}

export function toMcpErrorResult(error: unknown) {
  return {
    isError: true,
    ...toMcpTextResult({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  };
}
