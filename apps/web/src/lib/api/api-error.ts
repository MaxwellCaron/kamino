export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

export function isApiErrorStatus(error: unknown, status: number) {
  return error instanceof ApiError && error.status === status
}

export function shouldRetryApiQuery(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false
  }

  return failureCount < 3
}
