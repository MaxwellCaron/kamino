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
import type { CreateMode } from "@/features/principals/utils/principal-dialog-utils"
import {
  descriptionSchema,
  normalizeDescription,
  parsePositiveIntegerString,
  splitNonEmptyLines,
} from "@/features/principals/utils/principal-dialog-utils"

export {
  descriptionFieldSchema,
  descriptionSchema,
  normalizeDescription,
  positiveIntegerStringSchema,
  prefixSchema,
} from "@/features/principals/utils/principal-dialog-utils"
export type { CreateMode } from "@/features/principals/utils/principal-dialog-utils"

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(64, "Max 64 characters")
  .regex(/^[a-zA-Z0-9._-]+$/, "Alphanumeric, dot, dash, underscore only")

export const groupSchema = z.object({
  name: groupNameSchema,
  description: descriptionSchema,
})

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
    const lines = splitNonEmptyLines(values.listInput)

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

  const start = parsePositiveIntegerString(values.start, "Starting number")
  const quantity = parsePositiveIntegerString(values.quantity, "Quantity")
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
