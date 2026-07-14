export const VNC_LAYOUT_ANCHOR_SELECTOR = "[data-vnc-layout-anchor]"

export function alignVncLayoutAnchorIfOverscrolled() {
  const layoutContainer = document.querySelector(VNC_LAYOUT_ANCHOR_SELECTOR)
  if (!(layoutContainer instanceof HTMLElement)) {
    return
  }

  const containerTop = layoutContainer.getBoundingClientRect().top
  if (containerTop < 0) {
    window.scrollBy({ top: containerTop, left: 0, behavior: "auto" })
  }
}
