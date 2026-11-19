import { describe, expect, it } from "vitest"
import {
  formatRelativeTime,
  getRelativeTimeUpdateDelay,
} from "./relative-time-schedule"

describe("getRelativeTimeUpdateDelay", () => {
  it("returns null for dates older than seven days", () => {
    const now = new Date("2026-08-10T12:00:00.000Z")
    const date = new Date("2026-08-01T12:00:00.000Z")

    expect(getRelativeTimeUpdateDelay(date, now)).toBeNull()
  })

  it("schedules second updates for recent timestamps", () => {
    const now = new Date("2026-08-10T12:00:00.250Z")
    const date = new Date("2026-08-10T11:59:50.000Z")

    expect(getRelativeTimeUpdateDelay(date, now)).toBe(750)
  })

  it("schedules second updates for minute-level timestamps", () => {
    const now = new Date("2026-08-10T12:00:30.400Z")
    const date = new Date("2026-08-10T11:58:00.000Z")

    expect(getRelativeTimeUpdateDelay(date, now)).toBe(600)
  })

  it("schedules hour updates for hour-level timestamps", () => {
    const now = new Date(2026, 7, 10, 12, 30)
    const date = new Date(2026, 7, 10, 8)

    expect(getRelativeTimeUpdateDelay(date, now)).toBe(30 * 60 * 1000)
  })

  it("schedules day updates for multi-day timestamps", () => {
    const now = new Date(2026, 7, 10, 12)
    const date = new Date(2026, 7, 8, 12)

    expect(getRelativeTimeUpdateDelay(date, now)).toBe(12 * 60 * 60 * 1000)
  })
})

describe("formatRelativeTime", () => {
  it("formats second-level timestamps", () => {
    const now = new Date("2026-08-10T12:00:10.000Z")
    const date = new Date("2026-08-10T12:00:00.000Z")

    expect(formatRelativeTime(date, now)).toBe("10 seconds ago")
  })
})
