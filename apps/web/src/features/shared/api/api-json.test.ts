import { beforeEach, describe, expect, it, vi } from "vitest"
import { apiJson, apiVoid } from "./api-json"
import type * as AuthApiModule from "@/features/auth/api/auth-api"
import { ApiError, apiFetch } from "@/features/auth/api/auth-api"

vi.mock("@/features/auth/api/auth-api", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthApiModule>()
  return {
    ...actual,
    apiFetch: vi.fn(),
  }
})

const mockApiFetch = vi.mocked(apiFetch)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("apiJson", () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
  })

  it("resolves typed JSON on ok", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ id: 1, name: "test" }))

    await expect(
      apiJson<{ id: number; name: string }>("/api/v1/example", "fetch example")
    ).resolves.toEqual({ id: 1, name: "test" })
  })

  it("throws ApiError with the server message and status on 422", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ error: "boom" }, 422))

    await expect(
      apiJson("/api/v1/example", "fetch example")
    ).rejects.toMatchObject({ message: "boom", status: 422 })
    await expect(
      apiJson("/api/v1/example", "fetch example")
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("throws ApiError with a fallback message and status on 500 with non-JSON body", async () => {
    mockApiFetch.mockResolvedValue(new Response("not json", { status: 500 }))

    await expect(
      apiJson("/api/v1/example", "fetch example")
    ).rejects.toMatchObject({
      message: "Failed to fetch example: 500",
      status: 500,
    })
    await expect(
      apiJson("/api/v1/example", "fetch example")
    ).rejects.toBeInstanceOf(ApiError)
  })
})

describe("apiVoid", () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
  })

  it("resolves on 204 with no body", async () => {
    mockApiFetch.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(
      apiVoid("/api/v1/example", "delete example", { method: "DELETE" })
    ).resolves.toBeUndefined()
  })
})
