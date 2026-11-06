export type PodNetworkingMode = "none" | "lan-router-v1" | "lan-dmz-router-v1"

export type PodVmSegmentKey = "lan" | "dmz"

export function isPodNetworkingWithRouter(
  mode: PodNetworkingMode
): mode is Exclude<PodNetworkingMode, "none"> {
  return mode !== "none"
}

export function getPodNetworkingModeLabel(mode: PodNetworkingMode) {
  switch (mode) {
    case "none":
      return "None"
    case "lan-router-v1":
      return "LAN Router"
    case "lan-dmz-router-v1":
      return "LAN + DMZ Router"
  }
}

export function getPodSegmentLabel(segmentKey: PodVmSegmentKey) {
  return segmentKey === "dmz" ? "DMZ" : "LAN"
}
