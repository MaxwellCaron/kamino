import { forwardRef, useEffect, useImperativeHandle } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { VncConsole } from "./vnc-console"
import type { ComponentProps } from "react"
import type { VncScreenHandle } from "react-vnc"
import { renderWithQueryClient } from "@/test/test-utils"

const { mockApiFetch, mockApiUrl, mockDisconnect } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockApiUrl: vi.fn((path: string) => path),
  mockDisconnect: vi.fn(),
}))

let screenMountCount = 0
type FakeVncScreenProps = {
  onConnect?: () => void
  onDisconnect?: () => void
  url?: string
  rfbOptions?: { credentials?: { password?: string } }
}

let latestScreenProps: FakeVncScreenProps | null = null

const IDLE_TIMEOUT_MS = 30 * 60 * 1000

vi.mock("@/features/auth/api/auth-api", () => ({
  apiFetch: (...args: Array<unknown>) => mockApiFetch(...args),
  apiUrl: (path: string) => mockApiUrl(path),
}))

vi.mock("./vnc-screen-client", () => ({
  VncScreenClient: forwardRef<VncScreenHandle, FakeVncScreenProps>(
    function FakeVncScreen(props, ref) {
      useEffect(() => {
        latestScreenProps = props
      }, [props])

      useEffect(() => {
        screenMountCount += 1
      }, [])

      useImperativeHandle(
        ref,
        () =>
          ({
            disconnect: mockDisconnect,
            focus: vi.fn(),
            sendCtrlAltDel: vi.fn(),
            sendKey: vi.fn(),
          }) as unknown as VncScreenHandle
      )

      return <div data-testid="vnc-screen" />
    }
  ),
}))

function renderConsole(
  overrides: Partial<ComponentProps<typeof VncConsole>> = {}
) {
  const onStatusChange = vi.fn()
  const view = renderWithQueryClient(
    <VncConsole
      itemId="vm-a"
      powerStatus="running"
      isViewed
      onStatusChange={onStatusChange}
      {...overrides}
    />
  )
  const rerenderConsole = (
    props: Partial<ComponentProps<typeof VncConsole>> = {}
  ) =>
    view.rerender(
      <QueryClientProvider client={view.queryClient}>
        <VncConsole
          itemId="vm-a"
          powerStatus="running"
          isViewed
          onStatusChange={onStatusChange}
          {...props}
        />
      </QueryClientProvider>
    )
  return { onStatusChange, rerenderConsole, ...view }
}

function clickDisconnect() {
  const button = document.querySelector(
    'button[data-variant="destructive"][data-size="icon-xs"]'
  )
  if (!button) {
    throw new Error("Disconnect button not found")
  }
  fireEvent.click(button)
}

async function waitForVncScreen() {
  await waitFor(() => {
    expect(screen.getByTestId("vnc-screen")).toBeInTheDocument()
    expect(latestScreenProps).not.toBeNull()
  })
}

describe("VncConsole", () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    mockApiUrl.mockReset()
    mockApiUrl.mockImplementation((path: string) => path)
    mockDisconnect.mockReset()
    screenMountCount = 0
    latestScreenProps = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("reports connecting, requests the proxy endpoint, and passes credentials to the screen", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    const { onStatusChange } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    expect(onStatusChange).toHaveBeenCalledWith("connecting")
    await waitForVncScreen()

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/inventory/items/vm-a/vm/vnc/proxy",
      { method: "POST" }
    )
    expect(latestScreenProps?.url).toContain("sessionId=sess-1")
    expect(latestScreenProps?.rfbOptions?.credentials?.password).toBe("secret")
  })

  it("reports connected and disconnects only the active screen", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    const { onStatusChange } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()

    act(() => {
      latestScreenProps?.onConnect?.()
    })
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenCalledWith("connected")
    )

    clickDisconnect()
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith("disconnected")
  })

  it("clears the screen and reports disconnected on unexpected disconnect", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    const { onStatusChange } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()

    act(() => {
      latestScreenProps?.onConnect?.()
      latestScreenProps?.onDisconnect?.()
    })

    await waitFor(() => {
      expect(screen.queryByTestId("vnc-screen")).not.toBeInTheDocument()
      expect(onStatusChange).toHaveBeenCalledWith("disconnected")
    })
  })

  it("mounts a fresh inner screen when reconnecting with a new session id", async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ sessionId: "sess-1", password: "secret" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ sessionId: "sess-2", password: "secret-2" }),
      })

    const { onStatusChange } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()
    expect(screenMountCount).toBe(1)

    act(() => {
      latestScreenProps?.onConnect?.()
    })
    clickDisconnect()
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenCalledWith("disconnected")
    )

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitFor(() => expect(screenMountCount).toBe(2))
    expect(latestScreenProps?.url).toContain("sessionId=sess-2")
  })

  it("ignores a delayed disconnect event from the previous session", async () => {
    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ sessionId: "sess-1", password: "secret" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ sessionId: "sess-2", password: "secret-2" }),
      })

    const { onStatusChange } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()
    const firstSessionProps = latestScreenProps
    act(() => {
      firstSessionProps?.onConnect?.()
    })

    clickDisconnect()
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitFor(() => expect(screenMountCount).toBe(2))
    act(() => {
      latestScreenProps?.onConnect?.()
    })
    onStatusChange.mockClear()

    act(() => {
      firstSessionProps?.onDisconnect?.()
    })

    expect(screen.getByTestId("vnc-screen")).toBeInTheDocument()
    expect(onStatusChange).not.toHaveBeenCalledWith("disconnected")
  })

  it("reports error and never mounts a screen when the proxy request fails", async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    })

    const { onStatusChange } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith("error"))
    expect(screen.queryByTestId("vnc-screen")).not.toBeInTheDocument()
    expect(screenMountCount).toBe(0)
  })

  it("does not remount the inner screen when isViewed toggles", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    const { onStatusChange, rerenderConsole } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()
    act(() => {
      latestScreenProps?.onConnect?.()
    })
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenCalledWith("connected")
    )

    const screenNode = screen.getByTestId("vnc-screen")
    const mountsBeforeToggle = screenMountCount

    rerenderConsole({ isViewed: false })

    expect(screenMountCount).toBe(mountsBeforeToggle)
    expect(screen.getByTestId("vnc-screen")).toBe(screenNode)
  })

  it("expires and disconnects a session after 30 minutes away", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    const { onStatusChange, rerenderConsole } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()
    act(() => {
      latestScreenProps?.onConnect?.()
    })

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000)
    const mockTimer = 77 as unknown as ReturnType<typeof window.setTimeout>
    let idleCallback: TimerHandler | null = null
    const timeoutSpy = vi
      .spyOn(window, "setTimeout")
      .mockImplementation((handler, timeout) => {
        if (timeout === IDLE_TIMEOUT_MS) {
          idleCallback = handler
        }
        return mockTimer
      })

    rerenderConsole({ isViewed: false })

    expect(timeoutSpy).toHaveBeenCalledWith(
      expect.any(Function),
      IDLE_TIMEOUT_MS
    )
    expect(idleCallback).not.toBeNull()

    nowSpy.mockReturnValue(1_000 + IDLE_TIMEOUT_MS)
    act(() => {
      if (typeof idleCallback === "function") {
        idleCallback()
      }
    })

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith("expired")
    expect(screen.getByText("Session Expired")).toBeInTheDocument()
    expect(screen.queryByTestId("vnc-screen")).not.toBeInTheDocument()
  })

  it("cancels idle expiry when the session is viewed again", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    const { rerenderConsole } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()
    act(() => {
      latestScreenProps?.onConnect?.()
    })

    const mockTimer = 88 as unknown as ReturnType<typeof window.setTimeout>
    vi.spyOn(window, "setTimeout").mockReturnValue(mockTimer)
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout")

    rerenderConsole({ isViewed: false })
    rerenderConsole({ isViewed: true })

    expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimer)
    expect(mockDisconnect).not.toHaveBeenCalled()
    expect(screen.getByTestId("vnc-screen")).toBeInTheDocument()
  })

  it("expires on return when background timer delivery was delayed", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    const { onStatusChange, rerenderConsole } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()
    act(() => {
      latestScreenProps?.onConnect?.()
    })

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_000)
    const mockTimer = 99 as unknown as ReturnType<typeof window.setTimeout>
    vi.spyOn(window, "setTimeout").mockReturnValue(mockTimer)

    rerenderConsole({ isViewed: false })
    nowSpy.mockReturnValue(1_000 + IDLE_TIMEOUT_MS)
    rerenderConsole({ isViewed: true })

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith("expired")
    expect(screen.getByText("Session Expired")).toBeInTheDocument()
  })
})
