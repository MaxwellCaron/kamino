import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RelativeTimeCard } from "./relative-time-card"

describe("RelativeTimeCard", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("does not schedule timers for absolute display", () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout")
    const date = new Date("2026-08-10T11:59:00.000Z")

    render(<RelativeTimeCard date={date} display="absolute" />)

    expect(setTimeoutSpy).not.toHaveBeenCalled()
    expect(screen.getByRole("time")).toHaveAttribute(
      "datetime",
      date.toISOString()
    )
  })

  it("updates relative seconds on second boundaries", () => {
    const date = new Date("2026-08-10T11:59:50.000Z")

    render(<RelativeTimeCard date={date} display="relative" />)

    expect(screen.getByRole("time")).toHaveTextContent("10 seconds ago")

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByRole("time")).toHaveTextContent("11 seconds ago")
  })

  it("updates relative hours on hour boundaries", () => {
    const date = new Date("2026-08-10T10:00:00.000Z")

    render(<RelativeTimeCard date={date} display="relative" />)

    expect(screen.getByRole("time")).toHaveTextContent("2 hours ago")

    act(() => {
      vi.advanceTimersByTime(3_600_000)
    })

    expect(screen.getByRole("time")).toHaveTextContent("3 hours ago")
  })

  it("stops scheduling after seven days", () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout")
    const date = new Date("2026-08-01T12:00:00.000Z")

    render(<RelativeTimeCard date={date} display="relative" />)

    expect(setTimeoutSpy).not.toHaveBeenCalled()
    expect(screen.getByRole("time")).toHaveTextContent(
      date.toLocaleDateString()
    )
  })

  it("reschedules when the date prop changes", () => {
    const initialDate = new Date("2026-08-10T11:59:50.000Z")
    const nextDate = new Date("2026-08-10T11:59:40.000Z")

    const { rerender } = render(
      <RelativeTimeCard date={initialDate} display="relative" />
    )

    expect(screen.getByRole("time")).toHaveTextContent("10 seconds ago")

    rerender(<RelativeTimeCard date={nextDate} display="relative" />)

    expect(screen.getByRole("time")).toHaveTextContent("20 seconds ago")
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByRole("time")).toHaveTextContent("21 seconds ago")
  })

  it("clears timers on unmount", () => {
    const date = new Date("2026-08-10T11:59:50.000Z")

    const { unmount } = render(
      <RelativeTimeCard date={date} display="relative" />
    )

    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
