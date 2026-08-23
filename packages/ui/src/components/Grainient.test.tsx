import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Grainient from "./Grainient"

const renderMock = vi.fn()

vi.mock("ogl", () => {
  function Program(this: { uniforms: Record<string, { value: unknown }> }) {
    this.uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new Float32Array([1, 1]) },
    }
  }

  function Renderer(this: {
    gl: {
      canvas: HTMLCanvasElement
      drawingBufferWidth: number
      drawingBufferHeight: number
    }
    setSize: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
  }) {
    this.gl = {
      canvas: document.createElement("canvas"),
      drawingBufferWidth: 100,
      drawingBufferHeight: 100,
    }
    this.setSize = vi.fn()
    this.render = renderMock
  }

  return {
    Renderer,
    Triangle: vi.fn(function Triangle() {}),
    Program,
    Mesh: vi.fn(function Mesh() {}),
  }
})

describe("Grainient", () => {
  let rafId = 0
  const rafCallbacks = new Map<number, FrameRequestCallback>()
  let motionQuery: {
    matches: boolean
    listeners: Set<() => void>
    addEventListener: (event: string, listener: () => void) => void
    removeEventListener: (event: string, listener: () => void) => void
  }

  const requestAnimationFrameMock = vi.fn((cb: FrameRequestCallback) => {
    const id = ++rafId
    rafCallbacks.set(id, cb)
    return id
  })

  const cancelAnimationFrameMock = vi.fn((id: number) => {
    rafCallbacks.delete(id)
  })

  function flushRaf(time = 0) {
    const callbacks = [...rafCallbacks.entries()]
    rafCallbacks.clear()
    for (const [, callback] of callbacks) {
      callback(time)
    }
  }

  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: state,
    })
    document.dispatchEvent(new Event("visibilitychange"))
  }

  beforeEach(() => {
    rafId = 0
    rafCallbacks.clear()
    renderMock.mockClear()
    requestAnimationFrameMock.mockClear()
    cancelAnimationFrameMock.mockClear()

    motionQuery = {
      matches: false,
      listeners: new Set(),
      addEventListener: (_event, listener) => {
        motionQuery.listeners.add(listener)
      },
      removeEventListener: (_event, listener) => {
        motionQuery.listeners.delete(listener)
      },
    }

    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock)
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrameMock)
    vi.stubGlobal(
      "matchMedia",
      () => motionQuery as unknown as MediaQueryList
    )

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("schedules no recurring RAF for static Kamino props", () => {
    const { unmount } = render(
      <Grainient timeSpeed={0} grainAnimated={false} grainAmount={0.1} />
    )

    expect(requestAnimationFrameMock).not.toHaveBeenCalled()
    expect(renderMock.mock.calls.length).toBeGreaterThan(0)

    act(() => {
      flushRaf(16)
    })

    expect(requestAnimationFrameMock).not.toHaveBeenCalled()
    unmount()
    expect(cancelAnimationFrameMock).not.toHaveBeenCalled()
  })

  it("schedules one RAF chain for animated props", () => {
    const { unmount } = render(
      <Grainient timeSpeed={0.25} grainAnimated={false} grainAmount={0.1} />
    )

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1)

    act(() => {
      flushRaf(16)
    })

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2)
    unmount()
    expect(cancelAnimationFrameMock).toHaveBeenCalled()
  })

  it("pauses RAF while hidden and resumes once when visible", () => {
    render(<Grainient timeSpeed={0.25} grainAnimated={false} grainAmount={0.1} />)

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1)

    act(() => {
      setVisibility("hidden")
    })

    expect(cancelAnimationFrameMock).toHaveBeenCalled()

    act(() => {
      flushRaf(32)
    })

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1)

    act(() => {
      setVisibility("visible")
    })

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2)
  })

  it("cancels RAF on unmount", () => {
    const { unmount } = render(
      <Grainient timeSpeed={0.25} grainAnimated={false} grainAmount={0.1} />
    )

    unmount()
    expect(cancelAnimationFrameMock).toHaveBeenCalled()
  })

  it("does not schedule RAF when reduced motion is preferred", () => {
    motionQuery.matches = true

    render(<Grainient timeSpeed={0.25} grainAnimated={true} grainAmount={0.1} />)

    expect(requestAnimationFrameMock).not.toHaveBeenCalled()
    expect(renderMock.mock.calls.length).toBeGreaterThan(0)
  })
})
