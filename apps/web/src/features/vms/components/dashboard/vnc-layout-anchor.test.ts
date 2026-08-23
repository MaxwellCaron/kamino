import { afterEach, describe, expect, it, vi } from "vitest"

import { alignVncLayoutAnchorIfOverscrolled } from "./vnc-layout-anchor"

function mockRect(top: number): DOMRect {
  return {
    top,
    left: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }
}

describe("alignVncLayoutAnchorIfOverscrolled", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  it("scrolls up when the layout anchor is above the viewport", () => {
    const anchor = document.createElement("div")
    anchor.setAttribute("data-vnc-layout-anchor", "")
    document.body.appendChild(anchor)
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(mockRect(-72))
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})

    alignVncLayoutAnchorIfOverscrolled()

    expect(scrollBy).toHaveBeenCalledWith({
      top: -72,
      left: 0,
      behavior: "auto",
    })
  })

  it("does not scroll when the layout anchor is already in view", () => {
    const anchor = document.createElement("div")
    anchor.setAttribute("data-vnc-layout-anchor", "")
    document.body.appendChild(anchor)
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(mockRect(48))
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})

    alignVncLayoutAnchorIfOverscrolled()

    expect(scrollBy).not.toHaveBeenCalled()
  })
})
