import { describe, expect, it } from "vitest"
import { shouldAnimateGrainient } from "./grainient-animation"

describe("shouldAnimateGrainient", () => {
  it("returns false for Kamino static props", () => {
    expect(shouldAnimateGrainient(false, 0, false, 0.1)).toBe(false)
  })

  it("returns true for nonzero time speed", () => {
    expect(shouldAnimateGrainient(false, 0.25, false, 0.1)).toBe(true)
  })

  it("returns true for animated grain with amount", () => {
    expect(shouldAnimateGrainient(false, 0, true, 0.1)).toBe(true)
  })

  it("returns false for animated grain with zero amount", () => {
    expect(shouldAnimateGrainient(false, 0, true, 0)).toBe(false)
  })

  it("returns false when reduced motion is preferred", () => {
    expect(shouldAnimateGrainient(true, 0.25, true, 0.1)).toBe(false)
  })
})
