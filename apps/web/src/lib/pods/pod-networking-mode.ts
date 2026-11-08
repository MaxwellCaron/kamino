export const POD_NETWORK_PROFILES = [
  { key: "lan-router-v1", label: "LAN Router", hasDMZ: false },
  { key: "lan-dmz-router-v1", label: "LAN + DMZ Router", hasDMZ: true },
] as const

export const POD_NETWORK_PROFILE_KEYS = POD_NETWORK_PROFILES.map(
  (profile) => profile.key
)

export type PodNetworkingMode =
  "none" | (typeof POD_NETWORK_PROFILES)[number]["key"]

export function podNetworkProfileHasDMZ(profileKey: string) {
  return POD_NETWORK_PROFILES.some(
    (profile) => profile.key === profileKey && profile.hasDMZ
  )
}

export type PodVmSegmentKey = "lan" | "dmz"

export function isPodNetworkingWithRouter(
  mode: PodNetworkingMode
): mode is Exclude<PodNetworkingMode, "none"> {
  return mode !== "none"
}

export function getPodNetworkingModeLabel(mode: PodNetworkingMode) {
  if (mode === "none") return "None"
  return POD_NETWORK_PROFILES.find((profile) => profile.key === mode)?.label
}

export function getPodSegmentLabel(segmentKey: PodVmSegmentKey) {
  return segmentKey === "dmz" ? "DMZ" : "LAN"
}
