import { createRef } from "react"
import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  VNC_COMPRESSION_LEVEL,
  VNC_QUALITY_LEVEL,
  VncScreenClient,
} from "./vnc-screen-client"
import type { VncScreenClientHandle } from "./vnc-screen-client"

const {
  mockDisconnect,
  mockFocus,
  mockSendCtrlAltDel,
  mockSendKey,
  rfbInstances,
} = vi.hoisted(() => ({
  mockDisconnect: vi.fn(),
  mockFocus: vi.fn(),
  mockSendCtrlAltDel: vi.fn(),
  mockSendKey: vi.fn(),
  rfbInstances: [] as Array<{
    url: string
    options: { credentials: { password: string } }
    focusOnClick: boolean
    scaleViewport: boolean
    resizeSession: boolean
    qualityLevel: number
    compressionLevel: number
    showDotCursor: boolean
    background: string
    listeners: Map<string, Set<() => void>>
    emit: (event: string) => void
  }>,
}))

vi.mock("@novnc/novnc", () => {
  class MockRFB {
    focusOnClick = false
    scaleViewport = false
    resizeSession = true
    qualityLevel = 0
    compressionLevel = 0
    showDotCursor = false
    background = ""
    listeners = new Map<string, Set<() => void>>()

    constructor(
      public target: HTMLElement,
      public url: string,
      public options: { credentials: { password: string } }
    ) {
      this.disconnect = mockDisconnect
      this.focus = mockFocus
      this.sendCtrlAltDel = mockSendCtrlAltDel
      this.sendKey = mockSendKey
      rfbInstances.push(this)
    }

    disconnect: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    sendCtrlAltDel: ReturnType<typeof vi.fn>
    sendKey: ReturnType<typeof vi.fn>

    addEventListener(event: string, handler: () => void) {
      const set = this.listeners.get(event) ?? new Set()
      set.add(handler)
      this.listeners.set(event, set)
    }

    removeEventListener(event: string, handler: () => void) {
      this.listeners.get(event)?.delete(handler)
    }

    emit(event: string) {
      for (const handler of this.listeners.get(event) ?? []) {
        handler()
      }
    }
  }

  return { default: MockRFB }
})

function renderClient(
  overrides: Partial<React.ComponentProps<typeof VncScreenClient>> = {}
) {
  const onConnect = vi.fn()
  const onDisconnect = vi.fn()
  const onSecurityFailure = vi.fn()
  const ref = createRef<VncScreenClientHandle>()

  const view = render(
    <VncScreenClient
      ref={ref}
      url="ws://localhost/vnc?sessionId=sess-1"
      password="secret"
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      onSecurityFailure={onSecurityFailure}
      {...overrides}
    />
  )

  return { ref, onConnect, onDisconnect, onSecurityFailure, ...view }
}

describe("VncScreenClient", () => {
  beforeEach(() => {
    mockDisconnect.mockReset()
    mockFocus.mockReset()
    mockSendCtrlAltDel.mockReset()
    mockSendKey.mockReset()
    rfbInstances.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("constructs one RFB with performance settings and viewport options", () => {
    renderClient()

    expect(rfbInstances).toHaveLength(1)
    const rfb = rfbInstances[0]
    expect(rfb.url).toBe("ws://localhost/vnc?sessionId=sess-1")
    expect(rfb.options.credentials.password).toBe("secret")
    expect(rfb.focusOnClick).toBe(true)
    expect(rfb.scaleViewport).toBe(true)
    expect(rfb.resizeSession).toBe(false)
    expect(rfb.qualityLevel).toBe(VNC_QUALITY_LEVEL)
    expect(rfb.compressionLevel).toBe(VNC_COMPRESSION_LEVEL)
    expect(rfb.showDotCursor).toBe(false)
    expect(rfb.background).toBe("transparent")
  })

  it("hides the host cursor over the console surface", () => {
    const { container } = renderClient({
      style: { height: "100%" },
    })

    expect(container.firstElementChild).toHaveStyle({ cursor: "none" })
  })

  it("wires connect, disconnect, and security failure callbacks", () => {
    const { onConnect, onDisconnect, onSecurityFailure } = renderClient()
    const rfb = rfbInstances[0]

    act(() => {
      rfb.emit("connect")
      rfb.emit("disconnect")
      rfb.emit("securityfailure")
    })

    expect(onConnect).toHaveBeenCalledTimes(1)
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    expect(onSecurityFailure).toHaveBeenCalledTimes(1)
  })

  it("delegates imperative handle methods to the active RFB", () => {
    const { ref } = renderClient()

    ref.current?.disconnect()
    ref.current?.focus()
    ref.current?.sendCtrlAltDel()
    ref.current?.sendKey(0xff09, "Tab")

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(mockFocus).toHaveBeenCalledTimes(1)
    expect(mockSendCtrlAltDel).toHaveBeenCalledTimes(1)
    expect(mockSendKey).toHaveBeenCalledWith(0xff09, "Tab", undefined)
  })

  it("refreshes the viewport by toggling scaleViewport", () => {
    const { ref } = renderClient()
    const writes: Array<boolean> = []
    Object.defineProperty(rfbInstances[0], "scaleViewport", {
      get: () => writes.at(-1) ?? true,
      set: (value: boolean) => {
        writes.push(value)
      },
      configurable: true,
    })

    ref.current?.refreshViewport()

    expect(writes).toEqual([false, true])
  })

  it("does not recreate RFB when callback props change", () => {
    const { rerender } = renderClient()
    expect(rfbInstances).toHaveLength(1)

    rerender(
      <VncScreenClient
        url="ws://localhost/vnc?sessionId=sess-1"
        password="secret"
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSecurityFailure={vi.fn()}
      />
    )

    expect(rfbInstances).toHaveLength(1)
  })

  it("uses fresh callbacks without recreating RFB", () => {
    const onConnect = vi.fn()
    const { rerender } = renderClient({ onConnect })
    const rfb = rfbInstances[0]

    const nextOnConnect = vi.fn()
    rerender(
      <VncScreenClient
        url="ws://localhost/vnc?sessionId=sess-1"
        password="secret"
        onConnect={nextOnConnect}
        onDisconnect={vi.fn()}
        onSecurityFailure={vi.fn()}
      />
    )

    act(() => {
      rfb.emit("connect")
    })

    expect(onConnect).not.toHaveBeenCalled()
    expect(nextOnConnect).toHaveBeenCalledTimes(1)
  })

  it("creates a new RFB and disconnects the old one when the URL changes", () => {
    const { rerender } = renderClient()
    const first = rfbInstances[0]

    rerender(
      <VncScreenClient
        url="ws://localhost/vnc?sessionId=sess-2"
        password="secret"
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onSecurityFailure={vi.fn()}
      />
    )

    expect(rfbInstances).toHaveLength(2)
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(rfbInstances[1].url).toBe("ws://localhost/vnc?sessionId=sess-2")
    expect(first).not.toBe(rfbInstances[1])
  })

  it("removes listeners and disconnects exactly once on unmount", () => {
    const { onDisconnect, unmount } = renderClient()
    const rfb = rfbInstances[0]

    unmount()

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(onDisconnect).not.toHaveBeenCalled()
    expect(rfb.listeners.get("disconnect")?.size ?? 0).toBe(0)
  })
})
