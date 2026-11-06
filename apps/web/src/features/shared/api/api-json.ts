import { ApiError } from "@/features/shared/api/api-error"
import { apiFetch } from "@/features/auth/api/auth-api"

export async function throwResponseError(
  res: Response,
  label: string
): Promise<never> {
  const body = await res.json().catch(() => ({}))
  throw new ApiError(
    body.error ?? `Failed to ${label}: ${res.status}`,
    res.status
  )
}

/** Fetch JSON from the API; on !ok throws the server's error message. */
export async function apiJson<T>(
  input: string,
  label: string,
  init?: RequestInit
): Promise<T> {
  const res = await apiFetch(input, init)
  if (!res.ok) await throwResponseError(res, label)
  return res.json() as Promise<T>
}

export async function apiVoid(
  input: string,
  label: string,
  init?: RequestInit
): Promise<void> {
  const res = await apiFetch(input, init)
  if (!res.ok) await throwResponseError(res, label)
}
