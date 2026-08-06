import { z } from "zod"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"

export type CloneTargetFormValues = {
  key: string
  label: string
  lanVNet: string
  dmzVNet: string
  wanBridge: string
  wanIPBase: string
  cloudInitStorage: string
  cloudInitUserFilePattern: string
  cloudInitNetworkFile: string
  lanDmzUserFilePattern: string
  lanDmzNetworkFile: string
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

// The base is the first two octets; the network number becomes the third.
export const cloneTargetWANIPBaseSchema = z
  .string()
  .trim()
  .min(1, "WAN IP base is required")
  .regex(
    /^\d{1,3}\.\d{1,3}\.?$/,
    "Enter the first two octets, for example 172.16."
  )
  .refine(
    (value) =>
      value
        .replace(/\.$/, "")
        .split(".")
        .every((octet) => Number.parseInt(octet, 10) <= 255),
    { message: "Each octet must be 255 or lower" }
  )

export const cloneTargetStorageSchema = z
  .string()
  .trim()
  .min(1, "Cloud-init storage is required")

const snippetFilenameSchema = z
  .string()
  .trim()
  .min(1, "Filename is required")
  .refine((value) => !/[/\\]/.test(value), {
    message: "Must not contain path separators",
  })
  .refine((value) => !value.includes(".."), { message: "Must not contain '..'" })
  .refine((value) => !/\s/.test(value), {
    message: "Must not contain whitespace",
  })

export const cloneTargetUserPatternSchema = snippetFilenameSchema.refine(
  (value) => (value.match(/\{network\}/g) ?? []).length === 1,
  { message: "Must contain {network} exactly once" }
)

export const cloneTargetNetworkFileSchema = snippetFilenameSchema.refine(
  (value) => !value.includes("{network}"),
  { message: "Must not contain {network}" }
)

export function getDefaultCloneTargetFormValues(
  target?: PodCloneTarget
): CloneTargetFormValues {
  return {
    key: target?.key ?? "",
    label: target?.label ?? "",
    lanVNet: target?.lan_vnet ?? "",
    dmzVNet: target?.dmz_vnet ?? "",
    wanBridge: target?.wan_bridge ?? "",
    wanIPBase: target?.wan_ip_base ?? "",
    cloudInitStorage: target?.cloud_init_storage ?? "local",
    cloudInitUserFilePattern:
      target?.cloud_init_user_file_pattern ??
      "kamino-router-{network}-user-data.yaml",
    cloudInitNetworkFile:
      target?.cloud_init_network_file ?? "kamino-router-network-config.yaml",
    lanDmzUserFilePattern:
      target?.lan_dmz_user_file_pattern ??
      "kamino-router-lan-dmz-{network}-user-data.yaml",
    lanDmzNetworkFile:
      target?.lan_dmz_network_file ?? "kamino-router-lan-dmz-network-config.yaml",
  }
}

export function buildCloneTargetPayload(values: CloneTargetFormValues) {
  return {
    key: values.key.trim(),
    label: values.label.trim(),
    lan_vnet: values.lanVNet.trim(),
    dmz_vnet: values.dmzVNet.trim(),
    wan_bridge: values.wanBridge.trim(),
    wan_ip_base: values.wanIPBase.trim(),
    cloud_init_storage: values.cloudInitStorage.trim(),
    cloud_init_user_file_pattern: values.cloudInitUserFilePattern.trim(),
    cloud_init_network_file: values.cloudInitNetworkFile.trim(),
    lan_dmz_user_file_pattern: values.lanDmzUserFilePattern.trim(),
    lan_dmz_network_file: values.lanDmzNetworkFile.trim(),
  }
}
