import { z } from "zod"
import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form"
import type {
  ApiPrincipal,
  CreateGroupInput,
} from "@/features/principals/types/principals-types"

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(64, "Max 64 characters")
  .regex(/^[a-zA-Z0-9._-]+$/, "Alphanumeric, dot, dash, underscore only")

export const descriptionFieldSchema = z
  .string()
  .trim()
  .max(256, "Max 256 characters")

export const descriptionSchema = descriptionFieldSchema.optional()

export const prefixSchema = z.string().trim().min(1, "Prefix is required")

export const positiveIntegerStringSchema = (label: string) =>
  z.string().refine((value) => {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isInteger(parsed) && parsed >= 1
  }, `${label} must be a positive whole number`)

export const groupSchema = z.object({
  name: groupNameSchema,
  description: descriptionSchema,
})

export type CreateMode = "single" | "list" | "prefix"

export type GroupFormValues = {
  description: string
  listInput: string
  name: string
  prefix: string
  prefixDescription: string
  quantity: string
  start: string
}

export type GroupFormApi = ReactFormExtendedApi<
  GroupFormValues,
  FormValidateOrFn<GroupFormValues> | undefined,
  FormValidateOrFn<GroupFormValues> | undefined,
  FormAsyncValidateOrFn<GroupFormValues> | undefined,
  FormValidateOrFn<GroupFormValues> | undefined,
  FormAsyncValidateOrFn<GroupFormValues> | undefined,
  FormValidateOrFn<GroupFormValues> | undefined,
  FormAsyncValidateOrFn<GroupFormValues> | undefined,
  FormValidateOrFn<GroupFormValues> | undefined,
  FormAsyncValidateOrFn<GroupFormValues> | undefined,
  FormAsyncValidateOrFn<GroupFormValues> | undefined,
  unknown
>

export function getDefaultGroupFormValues(
  group?: ApiPrincipal
): GroupFormValues {
  return {
    name: group?.name ?? "",
    description: group?.description ?? "",
    listInput: "",
    prefix: "",
    start: "1",
    quantity: "10",
    prefixDescription: "",
  }
}

export function normalizeDescription(description: string) {
  const value = description.trim()
  return value.length > 0 ? value : undefined
}

export function parsePositiveInteger(value: string, label: string) {
  const parsed = Number.parseInt(value.trim(), 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive whole number`)
  }
  return parsed
}

function buildCreateGroupInput(args: {
  context: string
  description: string
  name: string
}): CreateGroupInput {
  const nameResult = groupNameSchema.safeParse(args.name.trim())
  if (!nameResult.success) {
    throw new Error(`${args.context}: ${nameResult.error.issues[0].message}`)
  }

  const description = normalizeDescription(args.description)
  const descriptionResult = descriptionSchema.safeParse(description)
  if (!descriptionResult.success) {
    throw new Error(
      `${args.context}: ${descriptionResult.error.issues[0].message}`
    )
  }

  return {
    name: nameResult.data,
    description: descriptionResult.data,
  }
}

export function buildCreateGroups(
  mode: CreateMode,
  values: GroupFormValues
): Array<CreateGroupInput> {
  if (mode === "single") {
    return [
      buildCreateGroupInput({
        context: "Single group",
        name: values.name,
        description: values.description,
      }),
    ]
  }

  if (mode === "list") {
    const lines = values.listInput.split("\n").flatMap((line) => {
      const trimmed = line.trim()
      return trimmed ? [trimmed] : []
    })

    if (lines.length === 0) {
      throw new Error("Provide at least one group")
    }

    return lines.map((line, index) => {
      const parts = line.split(",")
      return buildCreateGroupInput({
        context: `Line ${index + 1}`,
        name: parts[0] ?? "",
        description: parts.slice(1).join(","),
      })
    })
  }

  const prefix = values.prefix.trim()
  if (!prefix) {
    throw new Error("Prefix is required")
  }

  const start = parsePositiveInteger(values.start, "Starting number")
  const quantity = parsePositiveInteger(values.quantity, "Quantity")
  const width = Math.max(2, String(start + quantity - 1).length)

  return Array.from({ length: quantity }, (_, offset) => {
    const index = start + offset
    return buildCreateGroupInput({
      context: `Generated group ${offset + 1}`,
      name: `${prefix}${String(index).padStart(width, "0")}`,
      description: values.prefixDescription,
    })
  })
}
