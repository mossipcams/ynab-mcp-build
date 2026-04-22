export function toTextResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload)
      }
    ]
  };
}

export function toErrorResult(error: unknown) {
  return {
    isError: true,
    ...toTextResult({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  };
}
