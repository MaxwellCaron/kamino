import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type * as AuthApiModule from "./auth-api"
import type { AuthSession } from "../types/auth-types"

const mockSession: AuthSession = {
  user: {
    id: "1",
    group_count: 0,
    username: "alice",
    management_permissions: { grants: [] },
  },
  access_token_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("auth-api direct auth mutations", () => {
  let authApi: typeof AuthApiModule
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    authApi = await import("./auth-api")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("logout() sends a credentialed POST containing the CSRF header", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}))

    await authApi.logout()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/v1/auth/logout")
    expect(init?.method).toBe("POST")
    expect(init?.credentials).toBe("include")
    expect(new Headers(init?.headers).get("X-Kamino-Request")).toBe("1")
  })

  it("refreshAuth() sends a credentialed POST containing the CSRF header and resolves the session", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockSession))

    const session = await authApi.refreshAuth()

    expect(session).toEqual(mockSession)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/v1/auth/refresh")
    expect(init?.method).toBe("POST")
    expect(init?.credentials).toBe("include")
    expect(new Headers(init?.headers).get("X-Kamino-Request")).toBe("1")
  })

  it("login() sends a credentialed JSON POST", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(mockSession))

    const session = await authApi.login({ username: "alice", password: "secret" })

    expect(session).toEqual(mockSession)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/v1/auth/login")
    expect(init?.method).toBe("POST")
    expect(init?.credentials).toBe("include")
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json")
    expect(init?.body).toBe(JSON.stringify({ username: "alice", password: "secret" }))
  })

  it("login() does not trigger the protected-request retry path on 401", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid credentials" }, 401))

    await expect(
      authApi.login({ username: "alice", password: "wrong" })
    ).rejects.toThrow("invalid credentials")

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("refreshAuth() retries once after a 409 collision and resolves with exactly two requests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "refresh already completed; retry" }, 409)
    )
    fetchMock.mockResolvedValueOnce(jsonResponse(mockSession))

    const resultPromise = authApi.refreshAuth()
    await vi.advanceTimersByTimeAsync(300)
    const session = await resultPromise

    expect(session).toEqual(mockSession)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/refresh")
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/auth/refresh")
  })

  it("refreshAuth() still invalidates auth state and rejects on a 401 without retrying", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid refresh token" }, 401))

    await expect(authApi.refreshAuth()).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("changeOwnPassword() clears the scheduled refresh timer and navigates to login on success", async () => {
    const originalLocation = window.location
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: vi.fn(), pathname: "/dashboard", search: "", hash: "" },
    })

    try {
      fetchMock.mockResolvedValueOnce(jsonResponse(mockSession))
      await authApi.login({ username: "alice", password: "secret" })
      expect(vi.getTimerCount()).toBeGreaterThan(0)

      fetchMock.mockResolvedValueOnce(jsonResponse({}))
      await authApi.changeOwnPassword({
        current_password: "old",
        new_password: "new-password",
      })

      expect(vi.getTimerCount()).toBe(0)
      expect(window.location.assign).toHaveBeenCalledWith(
        "/login?redirect=%2Fdashboard"
      )
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        writable: true,
        value: originalLocation,
      })
    }
  })
})

describe("auth-api refresh/logout serialization", () => {
  let authApi: typeof AuthApiModule
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    authApi = await import("./auth-api")
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("logout() waits for an in-flight refresh to settle before sending its own request", async () => {
    const refreshResponse = createDeferred<Response>()
    fetchMock.mockImplementationOnce(() => refreshResponse.promise)
    fetchMock.mockResolvedValueOnce(jsonResponse({}))

    const refreshResult = authApi.refreshAuth()
    const logoutResult = authApi.logout()

    expect(fetchMock).toHaveBeenCalledTimes(1)

    refreshResponse.resolve(jsonResponse(mockSession))
    await refreshResult
    await logoutResult

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [logoutUrl] = fetchMock.mock.calls[1]
    expect(logoutUrl).toBe("/api/v1/auth/logout")
  })

  it("a stale refresh resolves to its caller without repopulating session state or scheduling a timer", async () => {
    const refreshResponse = createDeferred<Response>()
    fetchMock.mockImplementationOnce(() => refreshResponse.promise)
    fetchMock.mockResolvedValueOnce(jsonResponse({}))

    const refreshResult = authApi.refreshAuth()
    const logoutResult = authApi.logout()

    refreshResponse.resolve(jsonResponse(mockSession))
    const resolvedSession = await refreshResult
    await logoutResult

    expect(resolvedSession).toEqual(mockSession)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("concurrent logout() calls share a single network request", async () => {
    const logoutResponse = createDeferred<Response>()
    fetchMock.mockImplementationOnce(() => logoutResponse.promise)

    const first = authApi.logout()
    const second = authApi.logout()

    logoutResponse.resolve(jsonResponse({}))
    await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("logout() still reaches the logout endpoint when the in-flight refresh is rejected", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "refresh failed" }, 401))
    fetchMock.mockResolvedValueOnce(jsonResponse({}))

    const refreshResult = authApi.refreshAuth()
    const logoutResult = authApi.logout()

    await expect(refreshResult).rejects.toThrow()
    await logoutResult

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [logoutUrl] = fetchMock.mock.calls[1]
    expect(logoutUrl).toBe("/api/v1/auth/logout")
  })
})
