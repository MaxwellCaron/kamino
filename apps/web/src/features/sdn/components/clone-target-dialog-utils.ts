import { z } from "zod"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"

export const CLONE_TARGET_PROFILES = [
  { key: "lan-router-v1", label: "LAN Router", hasDMZ: false },
  { key: "lan-dmz-router-v1", label: "LAN + DMZ Router", hasDMZ: true },
] as const

export type CloneTargetProfileKey =
  (typeof CLONE_TARGET_PROFILES)[number]["key"]

export function profileHasDMZ(profileKey: string) {
  return profileKey === "lan-dmz-router-v1"
}

export type CloneTargetFormValues = {
  key: string
  label: string
  networkProfileKey: string
  lanVNet: string
  dmzVNet: string
  wanBridge: string
  wanSubnet: string
  networkMin: string
  networkMax: string
  cloudInitStorage: string
  snippetDir: string
}

export const cloneTargetKeySchema = z
  .string()
  .trim()
  .min(1, "Key is required")
  .max(32, "Must be 32 characters or fewer")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Lowercase letters and numbers, separated by single dashes"
  )

export const cloneTargetLabelSchema = z
  .string()
  .trim()
  .min(1, "Label is required")
  .max(48, "Must be 48 characters or fewer")

export const cloneTargetVNetSchema = z
  .string()
  .trim()
  .min(2, "Must be 2-8 characters")
  .max(8, "Must be 2-8 characters")
  .regex(
    /^[A-Za-z][A-Za-z0-9]*$/,
    "Must start with a letter, letters and numbers only"
  )

export const cloneTargetBridgeSchema = z
  .string()
  .trim()
  .min(1, "WAN bridge is required")

// A /16, so each pod's network number can fill the third octet.
export const cloneTargetWANSubnetSchema = z
  .string()
  .trim()
  .min(1, "WAN subnet is required")
  .regex(
    /^\d{1,3}\.\d{1,3}\.0\.0\/16$/,
    "Must be a /16 subnet, for example 172.16.0.0/16"
  )
  .refine(
    (value) =>
      value
        .split("/")[0]
        .split(".")
        .every((octet) => Number.parseInt(octet, 10) <= 255),
    { message: "Each octet must be 255 or lower" }
  )

// Renders the /24 a pod with the given network number would receive.
export function formatPodWANSubnet(
  wanSubnet: string,
  networkNumber: number | "x"
) {
  const octets = wanSubnet.split("/")[0]?.split(".") ?? []
  if (octets.length !== 4) return wanSubnet
  return `${octets[0]}.${octets[1]}.${networkNumber}.0/24`
}

export const cloneTargetStorageSchema = z
  .string()
  .trim()
  .min(1, "Cloud-init storage is required")

export const DEFAULT_SNIPPET_DIR = "/mnt/pve/mufasa-proxmox/snippets"

export const cloneTargetSnippetDirSchema = z
  .string()
  .trim()
  .min(1, "Snippet directory is required")
  .regex(/^\//, "Must be an absolute path, for example /mnt/pve/.../snippets")

export function getDefaultCloneTargetFormValues(
  target?: PodCloneTarget
): CloneTargetFormValues {
  return {
    key: target?.key ?? "",
    label: target?.label ?? "",
    networkProfileKey: target?.network_profile_key ?? "lan-router-v1",
    lanVNet: target?.lan_vnet ?? "",
    dmzVNet: target?.dmz_vnet ?? "",
    wanBridge: target?.wan_bridge ?? "",
    wanSubnet: target?.wan_subnet ?? "",
    networkMin: String(target?.network_min ?? 1),
    networkMax: String(target?.network_max ?? 254),
    cloudInitStorage: target?.cloud_init_storage ?? "local",
    snippetDir: DEFAULT_SNIPPET_DIR,
  }
}

export function buildCloneTargetPayload(values: CloneTargetFormValues) {
  return {
    key: values.key.trim(),
    label: values.label.trim(),
    network_profile_key: values.networkProfileKey,
    lan_vnet: values.lanVNet.trim(),
    dmz_vnet: profileHasDMZ(values.networkProfileKey)
      ? values.dmzVNet.trim()
      : "",
    wan_bridge: values.wanBridge.trim(),
    wan_subnet: values.wanSubnet.trim(),
    network_min: Number(values.networkMin),
    network_max: Number(values.networkMax),
    cloud_init_storage: values.cloudInitStorage.trim(),
  }
}

export function snippetPrefix(key: string) {
  return `kamino-${key}-router`
}

export function snippetFileNames(key: string) {
  const prefix = snippetPrefix(key)
  return {
    lanUserPattern: `${prefix}-{network}-user-data.yaml`,
    lanNetworkFile: `${prefix}-network-config.yaml`,
    lanDmzUserPattern: `${prefix}-lan-dmz-{network}-user-data.yaml`,
    lanDmzNetworkFile: `${prefix}-lan-dmz-network-config.yaml`,
  }
}

export const cloneTargetNetworkNumberSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Must be a whole number")
  .refine((value) => Number(value) >= 1 && Number(value) <= 254, {
    message: "Must be between 1 and 254",
  })

// The kamino-snippets.sh invocation that creates this target's cloud-init files.
// A LAN + DMZ target needs both snippet families, which the script calls "all".
export function buildSnippetCommand(values: CloneTargetFormValues) {
  const hasDMZ = profileHasDMZ(values.networkProfileKey)
  const names = snippetFileNames(values.key)
  const assignments = [
    `SNIPPET_DIR="${values.snippetDir}"`,
    `NETWORK_PROFILE="${hasDMZ ? "all" : "lan-router-v1"}"`,
    `NETWORK_MIN=${values.networkMin}`,
    `NETWORK_MAX=${values.networkMax}`,
    `WAN_SUBNET="${values.wanSubnet}"`,
    `LAN_ROUTER_USER_FILE_PATTERN="${names.lanUserPattern}"`,
    `LAN_ROUTER_NETWORK_CONFIG_FILE="${names.lanNetworkFile}"`,
  ]

  if (hasDMZ) {
    assignments.push(
      `LAN_DMZ_ROUTER_USER_FILE_PATTERN="${names.lanDmzUserPattern}"`,
      `LAN_DMZ_ROUTER_NETWORK_CONFIG_FILE="${names.lanDmzNetworkFile}"`
    )
  }

  return `${assignments.map((line) => `${line} \\`).join("\n")}\n./kamino-snippets.sh`
}
