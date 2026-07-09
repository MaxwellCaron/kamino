import { beforeEach, describe, expect, it, vi } from "vitest"
import { apiJson, apiVoid } from "./api-json"
import { apiFetch } from "@/features/auth/api/auth-api"

vi.mock("@/features/auth/api/auth-api", () => ({
  apiFetch: vi.fn(),
}))

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

  it("throws the server error message on 422", async () => {
    mockApiFetch.mockResolvedValue(jsonResponse({ error: "boom" }, 422))

    await expect(
      apiJson("/api/v1/example", "fetch example")
    ).rejects.toThrow(new Error("boom"))
  })

  it("throws a fallback message on 500 with non-JSON body", async () => {
    mockApiFetch.mockResolvedValue(
      new Response("not json", { status: 500 })
    )

    await expect(
      apiJson("/api/v1/example", "fetch example")
    ).rejects.toThrow(new Error("Failed to fetch example: 500"))
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
