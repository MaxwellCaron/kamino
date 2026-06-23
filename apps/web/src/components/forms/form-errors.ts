export function isTouchedInvalid(meta: {
  isTouched: boolean
  isValid: boolean
}): boolean {
  return meta.isTouched && !meta.isValid
}

export function formatFieldError(error: unknown): string | undefined {
  return typeof error === "string" ? error : undefined
}

export function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  return fallback
}
