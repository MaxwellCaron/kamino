import { z } from "zod"
import type {
  ApiSDNZone,
  ApiVNet,
  CreateVNetInput,
} from "@/features/sdn/types/sdn-types"

export type VNetCreateMode = "single" | "prefix"

export type TagRule = "disabled" | "required" | "optional"

const REQUIRED_TAG_ZONE_TYPES = new Set(["vlan", "vxlan", "evpn"])
const OPTIONAL_TAG_ZONE_TYPES = new Set(["qinq", "faucet"])

export const vnetIdSchema = z
  .string()
  .trim()
  .min(2, "Must be 2-8 characters")
  .max(8, "Must be 2-8 characters")
  .regex(
    /^[A-Za-z][A-Za-z0-9]*$/,
    "Must start with a letter, letters and numbers only"
  )

export const aliasSchema = z
  .string()
  .trim()
  .max(256, "Must be 256 characters or fewer")

export const zoneSchema = z.string().trim().min(1, "Zone is required")

const MAX_PREFIX_CREATE_VNETS = 50

export const namePrefixSchema = z
  .string()
  .trim()
  .min(1, "Name prefix is required")

export const amountSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Amount must be a positive whole number")
  .refine((value) => Number.parseInt(value, 10) >= 1, {
    message: "Amount must be a positive whole number",
  })
  .refine((value) => Number.parseInt(value, 10) <= MAX_PREFIX_CREATE_VNETS, {
    message: `Cannot create more than ${MAX_PREFIX_CREATE_VNETS} VNets at once`,
  })

export type VNetFormValues = {
  vnet: string
  zone: string
  tag: string
  alias: string
  vlanAware: boolean
  isolatePorts: boolean
  vnetPrefix: string
  aliasPrefix: string
  baseTag: string
  amount: string
}

export function getTagRule(zoneType: string | undefined): TagRule {
  if (!zoneType || zoneType === "simple") return "disabled"
  if (REQUIRED_TAG_ZONE_TYPES.has(zoneType)) return "required"
  if (OPTIONAL_TAG_ZONE_TYPES.has(zoneType)) return "optional"
  return "optional"
}

export function isVlanAwareDisabled(zoneType: string | undefined): boolean {
  return !zoneType || zoneType === "evpn"
}

export function getZoneType(
  zonesByName: Map<string, ApiSDNZone>,
  zone: string
) {
  return zonesByName.get(zone)?.type
}

export function validateTag(value: string, zoneType: string | undefined) {
  const rule = getTagRule(zoneType)
  if (rule === "disabled") return undefined

  const trimmed = value.trim()
  if (trimmed === "") {
    return rule === "required"
      ? "Tag is required for this zone type"
      : undefined
  }

  const tag = Number(trimmed)
  if (!Number.isInteger(tag) || tag < 1 || tag > 16777215) {
    return "Tag must be a whole number between 1 and 16777215"
  }
  return undefined
}

export function validateBaseTag(value: string, zoneType: string | undefined) {
  return validateTag(value, zoneType)
}

function parseOptionalTag(value: string, zoneType: string | undefined) {
  const rule = getTagRule(zoneType)
  if (rule === "disabled") return undefined

  const trimmed = value.trim()
  if (trimmed === "") {
    if (rule === "required") {
      throw new Error("Tag is required for this zone type")
    }
    return undefined
  }

  const tag = Number(trimmed)
  if (!Number.isInteger(tag) || tag < 1 || tag > 16777215) {
    throw new Error("Tag must be a whole number between 1 and 16777215")
  }
  return tag
}

function validateVNetIdOrThrow(vnetId: string, context: string) {
  const result = vnetIdSchema.safeParse(vnetId)
  if (!result.success) {
    throw new Error(
      `${context}: ${result.error.issues[0]?.message ?? "Invalid VNet ID"}`
    )
  }
  return result.data
}

export function getDefaultVNetFormValues(
  vnet?: ApiVNet,
  defaultZone?: string
): VNetFormValues {
  return {
    vnet: vnet?.vnet ?? "",
    zone: vnet?.zone ?? defaultZone ?? "",
    tag: vnet?.tag?.toString() ?? "",
    alias: vnet?.alias ?? "",
    vlanAware: vnet?.vlanaware ?? true,
    isolatePorts: vnet?.isolate_ports ?? false,
    vnetPrefix: "",
    aliasPrefix: "",
    baseTag: "",
    amount: "10",
  }
}

function buildSingleCreateVNet(
  values: VNetFormValues,
  zoneType: string | undefined
): CreateVNetInput {
  const vnet = validateVNetIdOrThrow(values.vnet.trim(), "Name")
  const zone = zoneSchema.parse(values.zone.trim())
  const alias = values.alias.trim()
  if (alias) {
    aliasSchema.parse(alias)
  }

  const tag = parseOptionalTag(values.tag, zoneType)

  return {
    vnet,
    zone,
    ...(tag !== undefined ? { tag } : {}),
    ...(alias ? { alias } : {}),
    vlanaware: values.vlanAware,
    isolate_ports: values.isolatePorts,
  }
}

function buildPrefixCreateVNets(
  values: VNetFormValues,
  zoneType: string | undefined
): Array<CreateVNetInput> {
  const zone = zoneSchema.parse(values.zone.trim())
  const vnetPrefix = namePrefixSchema.parse(values.vnetPrefix)

  const aliasPrefix = values.aliasPrefix
  const hasAliasPrefix = aliasPrefix.trim().length > 0
  const amount = Number.parseInt(amountSchema.parse(values.amount), 10)

  const tagRule = getTagRule(zoneType)
  const baseTagTrimmed = values.baseTag.trim()
  let tagBase: number | undefined
  if (tagRule !== "disabled") {
    if (baseTagTrimmed === "") {
      if (tagRule === "required") {
        throw new Error("Tag is required for this zone type")
      }
    } else {
      tagBase = Number(baseTagTrimmed)
      if (!Number.isInteger(tagBase) || tagBase < 1 || tagBase > 16777215) {
        throw new Error("Tag must be a whole number between 1 and 16777215")
      }
      if (tagBase + amount - 1 > 16777215) {
        throw new Error("Generated tags exceed the maximum of 16777215")
      }
    }
  }

  return Array.from({ length: amount }, (_, offset) => {
    const suffix = tagBase !== undefined ? tagBase + offset : offset + 1
    const vnet = validateVNetIdOrThrow(
      `${vnetPrefix}${suffix}`,
      `Generated VNet ${offset + 1}`
    )
    const alias = hasAliasPrefix ? `${aliasPrefix}${suffix}` : undefined
    if (alias) {
      aliasSchema.parse(alias)
    }

    let tag: number | undefined
    if (tagRule !== "disabled" && tagBase !== undefined) {
      tag = tagBase + offset
      if (tag > 16777215) {
        throw new Error(
          `Generated tag for VNet ${offset + 1} exceeds the maximum of 16777215`
        )
      }
    }

    return {
      vnet,
      zone,
      ...(tag !== undefined ? { tag } : {}),
      ...(alias ? { alias } : {}),
      vlanaware: values.vlanAware,
      isolate_ports: values.isolatePorts,
    }
  })
}

export function getPrefixCreatePreview(
  values: Pick<VNetFormValues, "vnetPrefix" | "baseTag" | "amount">,
  zoneType: string | undefined
) {
  const prefix = values.vnetPrefix.trim()
  if (!prefix) return undefined

  const amountResult = amountSchema.safeParse(values.amount)
  if (!amountResult.success) return undefined

  const tagRule = getTagRule(zoneType)
  let start = 1
  if (tagRule !== "disabled" && values.baseTag.trim()) {
    const baseTag = Number(values.baseTag.trim())
    if (!Number.isInteger(baseTag) || baseTag < 1 || baseTag > 16777215) {
      return undefined
    }
    start = baseTag
  }

  const amount = Number.parseInt(amountResult.data, 10)
  return `This will create ${prefix}${start} - ${prefix}${start + amount - 1}`
}

export function buildCreateVNets(
  mode: VNetCreateMode,
  values: VNetFormValues,
  zoneType: string | undefined
): Array<CreateVNetInput> {
  if (mode === "single") {
    return [buildSingleCreateVNet(values, zoneType)]
  }
  return buildPrefixCreateVNets(values, zoneType)
}
