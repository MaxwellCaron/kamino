import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { forwardRef, useEffect, useImperativeHandle } from "react"
import type { ComponentProps } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { VncConsole } from "./vnc-console"
import type { VncScreenClientHandle } from "@/lib/vms/console/vnc-types"
import { renderWithQueryClient } from "@/test/test-utils"

const {
  mockApiFetch,
  mockApiUrl,
  mockDisconnect,
  mockRefreshViewport,
  mockAlignVncLayoutAnchor,
  mockShowSingleMutationToast,
  mockDownloadSpiceConfig,
  mockVmOverviewQueryOptions,
} = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockApiUrl: vi.fn((path: string) => path),
  mockDisconnect: vi.fn(),
  mockRefreshViewport: vi.fn(),
  mockAlignVncLayoutAnchor: vi.fn(),
  mockShowSingleMutationToast: vi.fn(),
  mockDownloadSpiceConfig: vi.fn(),
  mockVmOverviewQueryOptions: vi.fn(),
}))

let screenMountCount = 0
type FakeVncScreenProps = {
  onConnect?: () => void
  onDisconnect?: () => void
  url?: string
  password?: string
}

let latestScreenProps: FakeVncScreenProps | null = null

const IDLE_TIMEOUT_MS = 30 * 60 * 1000

function mockOverviewQuery(display = "qxl") {
  mockVmOverviewQueryOptions.mockImplementation((itemId: string) => ({
    queryKey: ["inventory", "item", itemId, "vm", "overview"] as const,
    queryFn: () => Promise.resolve({ display, networks: [] }),
    enabled: !!itemId,
  }))
}

vi.mock("@/lib/auth/auth-session", () => ({
  apiFetch: (...args: Array<unknown>) => mockApiFetch(...args),
  apiUrl: (path: string) => mockApiUrl(path),
}))

vi.mock("@/lib/vms/vm-console-api", () => ({
  downloadSpiceConfig: (...args: Array<unknown>) =>
    mockDownloadSpiceConfig(...args),
}))

vi.mock("@/lib/vms/vm-api", () => ({
  vmOverviewQueryOptions: (itemId: string) =>
    mockVmOverviewQueryOptions(itemId),
}))

vi.mock("@/components/feedback/mutation-progress-toast", () => ({
  showSingleMutationToast: (...args: Array<unknown>) =>
    mockShowSingleMutationToast(...args),
}))

vi.mock("../../../lib/vms/console/vnc-layout-anchor", () => ({
  alignVncLayoutAnchorIfOverscrolled: () => mockAlignVncLayoutAnchor(),
}))

vi.mock("./vnc-screen-client", () => ({
  VncScreenClient: forwardRef<VncScreenClientHandle, FakeVncScreenProps>(
    function FakeVncScreen(props, ref) {
      useEffect(() => {
        latestScreenProps = props
      }, [props])

      useEffect(() => {
        screenMountCount += 1
      }, [])

      useImperativeHandle(ref, () => ({
        disconnect: mockDisconnect,
        focus: vi.fn(),
        sendCtrlAltDel: vi.fn(),
        sendKey: vi.fn(),
        refreshViewport: mockRefreshViewport,
      }))

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
      guestType="qemu"
      powerStatus="running"
      vmName="Lab VM"
      vmid={113}
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
          guestType="qemu"
          powerStatus="running"
          vmName="Lab VM"
          vmid={113}
          isViewed
          onStatusChange={onStatusChange}
          {...props}
        />
      </QueryClientProvider>
    )
  return { onStatusChange, rerenderConsole, ...view }
}

function clickDisconnect() {
  fireEvent.click(
    screen.getByRole("button", { name: "Disconnect VNC session" })
  )
}

async function waitForVncScreen() {
  await waitFor(() => {
    expect(screen.getByTestId("vnc-screen")).toBeInTheDocument()
    expect(latestScreenProps).not.toBeNull()
  })
}

function mockAnimationFrames() {
  const rafQueue = new Map<number, FrameRequestCallback>()
  let nextId = 1

  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextId++
    rafQueue.set(id, cb)
    return id
  })
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    rafQueue.delete(id)
  })

  return {
    flush() {
      while (rafQueue.size > 0) {
        const callbacks = [...rafQueue.values()]
        rafQueue.clear()
        act(() => {
          for (const callback of callbacks) callback(0)
        })
      }
    },
  }
}

describe("VncConsole", () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    mockApiUrl.mockReset()
    mockApiUrl.mockImplementation((path: string) => path)
    mockDisconnect.mockReset()
    mockRefreshViewport.mockReset()
    mockAlignVncLayoutAnchor.mockReset()
    mockShowSingleMutationToast.mockReset()
    mockDownloadSpiceConfig.mockReset()
    mockDownloadSpiceConfig.mockResolvedValue(undefined)
    mockVmOverviewQueryOptions.mockReset()
    mockOverviewQuery("qxl")
    screenMountCount = 0
    latestScreenProps = null
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("reports connecting, requests the proxy endpoint, and passes credentials to the screen", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    const { onStatusChange } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    expect(mockAlignVncLayoutAnchor).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith("connecting")
    await waitForVncScreen()

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/v1/inventory/items/vm-a/vm/vnc/proxy",
      { method: "POST" }
    )
    expect(latestScreenProps?.url).toContain("sessionId=sess-1")
    expect(latestScreenProps?.password).toBe("secret")
  })

  it("exposes an accessible name for the disconnect control when connected", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()
    act(() => {
      latestScreenProps?.onConnect?.()
    })

    expect(
      screen.getByRole("button", { name: "Disconnect VNC session" })
    ).toBeInTheDocument()
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

  it("refreshes the local viewport scale after becoming viewed again", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    const frames = mockAnimationFrames()
    const { onStatusChange, rerenderConsole } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()
    act(() => {
      latestScreenProps?.onConnect?.()
    })
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenCalledWith("connected")
    )
    frames.flush()

    const mountsBeforeToggle = screenMountCount
    mockRefreshViewport.mockClear()
    onStatusChange.mockClear()

    rerenderConsole({ isViewed: false })
    rerenderConsole({ isViewed: true })
    frames.flush()

    expect(screenMountCount).toBe(mountsBeforeToggle)
    expect(mockRefreshViewport).toHaveBeenCalledTimes(1)
    expect(onStatusChange).not.toHaveBeenCalled()
  })

  it("cancels a queued viewport refresh after disconnect", async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessionId: "sess-1", password: "secret" }),
    })

    const frames = mockAnimationFrames()
    const { rerenderConsole } = renderConsole()

    fireEvent.click(screen.getByRole("button", { name: "Connect" }))
    await waitForVncScreen()
    act(() => {
      latestScreenProps?.onConnect?.()
    })
    frames.flush()

    mockRefreshViewport.mockClear()
    rerenderConsole({ isViewed: false })
    rerenderConsole({ isViewed: true })
    clickDisconnect()
    frames.flush()

    expect(mockRefreshViewport).not.toHaveBeenCalled()
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

    vi.useFakeTimers()
    rerenderConsole({ isViewed: false })

    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1))
    expect(mockDisconnect).not.toHaveBeenCalled()
    expect(screen.getByTestId("vnc-screen")).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith("expired")
    expect(screen.getByText("Session Expired")).toBeInTheDocument()
    expect(screen.queryByTestId("vnc-screen")).not.toBeInTheDocument()
  })

  it("hides SPICE download when the guest does not support native SPICE", async () => {
    mockOverviewQuery("std")

    renderConsole()

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Download SPICE config" })
      ).not.toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: "Connect" })).toBeInTheDocument()
  })

  it("downloads a SPICE config without changing VNC state", async () => {
    renderConsole()

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Download SPICE config" })
      ).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole("button", { name: "Download SPICE config" })
    )

    await waitFor(() => {
      expect(mockShowSingleMutationToast).toHaveBeenCalledWith({
        title: "Downloading SPICE config",
        name: "VM 113 (Lab VM)",
        promise: expect.any(Promise),
        successDescription: "Downloaded",
      })
      expect(mockDownloadSpiceConfig).toHaveBeenCalledWith("vm-a")
    })
    expect(screen.queryByTestId("vnc-screen")).not.toBeInTheDocument()
    expect(screenMountCount).toBe(0)
  })

  it("routes SPICE download failures through the mutation toast", async () => {
    mockDownloadSpiceConfig.mockRejectedValue(
      new Error("failed to create SPICE configuration")
    )
    mockShowSingleMutationToast.mockImplementation(
      ({ promise }: { promise: Promise<unknown> }) => {
        void promise.catch(() => {})
      }
    )

    renderConsole()

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Download SPICE config" })
      ).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole("button", { name: "Download SPICE config" })
    )

    await waitFor(() => {
      expect(mockShowSingleMutationToast).toHaveBeenCalledTimes(1)
    })

    const passedPromise = mockShowSingleMutationToast.mock.calls[0][0]
      .promise as Promise<unknown>
    await expect(passedPromise).rejects.toThrow(
      "failed to create SPICE configuration"
    )
    expect(screen.queryByTestId("vnc-screen")).not.toBeInTheDocument()
  })

  it("prevents duplicate SPICE downloads while in flight", async () => {
    let resolveDownload: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      resolveDownload = resolve
    })
    mockDownloadSpiceConfig.mockReturnValue(pending)

    renderConsole()

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Download SPICE config" })
      ).toBeInTheDocument()
    })

    const downloadButton = screen.getByRole("button", {
      name: "Download SPICE config",
    })
    fireEvent.click(downloadButton)
    fireEvent.click(downloadButton)

    expect(mockShowSingleMutationToast).toHaveBeenCalledTimes(1)
    expect(mockDownloadSpiceConfig).toHaveBeenCalledTimes(1)
    expect(downloadButton).toBeDisabled()

    await act(async () => {
      resolveDownload?.()
      await pending
    })

    await waitFor(() => {
      expect(downloadButton).not.toBeDisabled()
    })
  })

  it("disables Connect and SPICE download when the guest is stopped", async () => {
    renderConsole({ powerStatus: "stopped" })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Download SPICE config" })
      ).toBeDisabled()
    })

    expect(screen.getByRole("button", { name: "Connect" })).toBeDisabled()
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

    vi.useFakeTimers()
    rerenderConsole({ isViewed: false })
    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS / 2))
    rerenderConsole({ isViewed: true })
    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS))

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

    vi.useFakeTimers()
    const hiddenAt = Date.now()
    rerenderConsole({ isViewed: false })
    vi.setSystemTime(hiddenAt + IDLE_TIMEOUT_MS)
    rerenderConsole({ isViewed: true })

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith("expired")
    expect(screen.getByText("Session Expired")).toBeInTheDocument()
  })
})
