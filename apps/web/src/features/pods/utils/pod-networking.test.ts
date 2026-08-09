import { describe, expect, it } from "vitest"
import {
  getPreferredPodCloneTarget,
  podCloneTargetSupportsProfile,
} from "./pod-networking"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"

function target(
  key: string,
  profile: PodCloneTarget["network_profile_key"],
  isDefault = false
): PodCloneTarget {
  return {
    key,
    label: key,
    network_profile_key: profile,
    lan_vnet: "pod",
    dmz_vnet: profile === "lan-dmz-router-v1" ? "dmz" : "",
    wan_bridge: "vmbr0",
    wan_subnet: "172.16.0.0/16",
    network_min: 1,
    network_max: 254,
    cloud_init_storage: "local",
    cloud_init_user_file_pattern: "user.yaml",
    cloud_init_network_file: "network.yaml",
    is_default: isDefault,
    is_personal: false,
  }
}

describe("pod clone target compatibility", () => {
  const lan = target("lan", "lan-router-v1", true)
  const lanDmz = target("lan-dmz", "lan-dmz-router-v1")

  it("allows LAN + DMZ targets to host either profile", () => {
    expect(podCloneTargetSupportsProfile(lanDmz, "lan-router-v1")).toBe(true)
    expect(podCloneTargetSupportsProfile(lanDmz, "lan-dmz-router-v1")).toBe(
      true
    )
  })

  it("rejects a LAN-only target for the LAN + DMZ profile", () => {
    expect(podCloneTargetSupportsProfile(lan, "lan-dmz-router-v1")).toBe(false)
  })

  it("prefers the default when it is compatible and otherwise uses the first compatible target", () => {
    expect(
      getPreferredPodCloneTarget([lanDmz, lan], "lan-router-v1")?.key
    ).toBe("lan")
    expect(
      getPreferredPodCloneTarget([lan, lanDmz], "lan-dmz-router-v1")?.key
    ).toBe("lan-dmz")
  })
})
