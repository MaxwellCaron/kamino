import type { AuthSession } from "../types/auth-types"

const AUTH_REFRESH_BUFFER_MS = 60_000
const AUTH_BOOTSTRAP_RETRY_BUFFER_MS = 5_000
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") ??
  (import.meta.env.DEV ? "http://localhost:8080" : "")

let currentSession: AuthSession | null = null
let refreshPromise: Promise<AuthSession> | null = null
let bootstrapPromise: Promise<AuthSession> | null = null
let refreshTimer: number | null = null
let authFailure: AuthenticationError | null = null

export class AuthenticationError extends Error {}

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function clearRefreshTimer() {
  if (refreshTimer) {
    window.clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

function scheduleRefresh(expiresAt: string) {
  clearRefreshTimer()

  if (typeof window === "undefined") return

  const refreshAt = new Date(expiresAt).getTime() - AUTH_REFRESH_BUFFER_MS
  const delay = Math.max(refreshAt - Date.now(), 0)

  refreshTimer = window.setTimeout(() => {
    void refreshAuth().catch(() => {
      // Keep the current UI alive on transient failures.
    })
  }, delay)
}

function applyAuthSession(session: AuthSession): AuthSession {
  currentSession = session
  authFailure = null
  scheduleRefresh(session.access_token_expires_at)
  return session
}

function resetAuthState() {
  currentSession = null
  bootstrapPromise = null
  clearRefreshTimer()
  refreshPromise = null
}

function clearAuthState() {
  resetAuthState()
  authFailure = null
}

function invalidateAuthState(message = "authentication failed") {
  resetAuthState()
  authFailure = new AuthenticationError(message)
}

function redirectToLogin() {
  if (typeof window === "undefined") return
  if (window.location.pathname === "/login") return

  const redirect = `${window.location.pathname}${window.location.search}${window.location.hash}`
  window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`)
}

function isAuthEndpoint(input: string) {
  return input.startsWith("/api/v1/auth/")
}

export async function apiFetch(
  input: string,
  init?: RequestInit,
  options?: { retryOn401?: boolean }
): Promise<Response> {
  const retryOn401 = options?.retryOn401 ?? true
  const requestInit = { credentials: "include" as const, ...init }
  const isProtectedRequest = retryOn401 && !isAuthEndpoint(input)

  if (isProtectedRequest) {
    if (authFailure) {
      redirectToLogin()
      return new Response(null, { status: 401, statusText: "Unauthorized" })
    }

    try {
      if (refreshPromise) {
        await refreshPromise
      } else if (currentSession !== null && isSessionExpired(currentSession)) {
        await refreshAuth()
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        redirectToLogin()
      }

      return new Response(null, { status: 401, statusText: "Unauthorized" })
    }
  }

  const response = await fetch(apiUrl(input), requestInit)
  if (response.status !== 401 || !retryOn401 || isAuthEndpoint(input)) {
    return response
  }

  try {
    await refreshAuth()
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirectToLogin()
    }
    return response
  }

  const retried = await fetch(apiUrl(input), requestInit)
  if (retried.status === 401) {
    invalidateAuthState("request retry failed")
    redirectToLogin()
  }

  return retried
}

export async function fetchAuthSession(): Promise<AuthSession> {
  const res = await apiFetch("/api/v1/auth/me")
  if (!res.ok) throw new Error("not authenticated")
  return applyAuthSession(await res.json())
}

export async function ensureAuth(): Promise<AuthSession> {
  if (authFailure) {
    redirectToLogin()
    throw authFailure
  }

  if (isSessionUsable(currentSession)) {
    return currentSession
  }

  if (bootstrapPromise) {
    return bootstrapPromise
  }

  bootstrapPromise = (async () => {
    if (isSessionExpired(currentSession)) {
      return refreshAuth()
    }

    try {
      return await fetchAuthSession()
    } catch {
      return await refreshAuth()
    }
  })()

  try {
    return await bootstrapPromise
  } finally {
    bootstrapPromise = null
  }
}

export const authMeQueryOptions = {
  queryKey: ["auth", "me"] as const,
  queryFn: fetchAuthSession,
  retry: false,
  staleTime: Infinity,
}

export async function login(params: {
  username: string
  password: string
}): Promise<AuthSession> {
  const res = await fetch(apiUrl("/api/v1/auth/login"), {
    ...{ method: "POST", credentials: "include" as const },
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "Login failed")
  }

  return applyAuthSession(await res.json())
}

export async function logout(): Promise<void> {
  await fetch(apiUrl("/api/v1/auth/logout"), {
    ...{ method: "POST", credentials: "include" as const },
  })
  clearAuthState()
}

export async function refreshAuth(): Promise<AuthSession> {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    const res = await fetch(apiUrl("/api/v1/auth/refresh"), {
      method: "POST",
      credentials: "include",
    })
    if (!res.ok) {
      if (res.status === 401) {
        try {
          return await fetchAuthSession()
        } catch {
          invalidateAuthState("refresh failed")
          throw authFailure ?? new AuthenticationError("refresh failed")
        }
      }
      throw new Error("refresh failed")
    }

    return applyAuthSession(await res.json())
  })()

  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

function getSessionExpiryMs(session: AuthSession | null) {
  if (!session) return 0
  return new Date(session.access_token_expires_at).getTime()
}

function isSessionExpired(session: AuthSession | null) {
  return Date.now() >= getSessionExpiryMs(session)
}

function isSessionUsable(session: AuthSession | null): session is AuthSession {
  return (
    !!session &&
    Date.now() < getSessionExpiryMs(session) - AUTH_BOOTSTRAP_RETRY_BUFFER_MS
  )
}
