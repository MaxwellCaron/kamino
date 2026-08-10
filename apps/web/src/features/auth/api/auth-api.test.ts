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
})
