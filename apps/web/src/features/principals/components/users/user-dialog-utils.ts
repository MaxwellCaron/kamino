import { z } from "zod"
import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form"
import type {
  ApiPrincipal,
  CreateUserInput,
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

export const usernameSchema = z
  .string()
  .trim()
  .min(1, "Username is required")
  .max(20, "Max 20 characters")
  .regex(/^[a-zA-Z0-9._-]+$/, "Alphanumeric, dot, dash, underscore only")

export const requiredPasswordSchema = z.string().min(8, "Minimum 8 characters")
export const optionalPasswordSchema = z.union([
  z.literal(""),
  requiredPasswordSchema,
])
export const fullNameSchema = z
  .string()
  .trim()
  .refine(
    (value) => Array.from(value).length <= 128,
    "Full name must be 128 characters or fewer"
  )

export const userSchema = z.object({
  username: usernameSchema,
  fullName: fullNameSchema,
  description: descriptionSchema,
  password: z.string().optional(),
})

export type UserFormValues = {
  description: string
  fullName: string
  listInput: string
  password: string
  prefix: string
  prefixDescription: string
  quantity: string
  sharedPassword: string
  start: string
  username: string
}

export type UserFormApi = ReactFormExtendedApi<
  UserFormValues,
  FormValidateOrFn<UserFormValues> | undefined,
  FormValidateOrFn<UserFormValues> | undefined,
  FormAsyncValidateOrFn<UserFormValues> | undefined,
  FormValidateOrFn<UserFormValues> | undefined,
  FormAsyncValidateOrFn<UserFormValues> | undefined,
  FormValidateOrFn<UserFormValues> | undefined,
  FormAsyncValidateOrFn<UserFormValues> | undefined,
  FormValidateOrFn<UserFormValues> | undefined,
  FormAsyncValidateOrFn<UserFormValues> | undefined,
  FormAsyncValidateOrFn<UserFormValues> | undefined,
  unknown
>

export function getDefaultUserFormValues(user?: ApiPrincipal): UserFormValues {
  return {
    username: user?.name ?? "",
    fullName: user?.full_name ?? "",
    description: user?.description ?? "",
    password: "",
    listInput: "",
    prefix: "",
    start: "1",
    quantity: "10",
    sharedPassword: "",
    prefixDescription: "",
  }
}

function buildCreateUserInput(args: {
  context: string
  description: string
  groupIds: Array<string>
  password: string
  username: string
}): CreateUserInput {
  const usernameResult = usernameSchema.safeParse(args.username.trim())
  if (!usernameResult.success) {
    throw new Error(
      `${args.context}: ${usernameResult.error.issues[0].message}`
    )
  }

  const passwordResult = requiredPasswordSchema.safeParse(args.password.trim())
  if (!passwordResult.success) {
    throw new Error(
      `${args.context}: ${passwordResult.error.issues[0].message}`
    )
  }

  const description = normalizeDescription(args.description)
  const descriptionResult = descriptionSchema.safeParse(description)
  if (!descriptionResult.success) {
    throw new Error(
      `${args.context}: ${descriptionResult.error.issues[0].message}`
    )
  }

  return {
    username: usernameResult.data,
    password: passwordResult.data,
    description: descriptionResult.data,
    group_ids: args.groupIds,
  }
}

export function buildCreateUsers(
  mode: CreateMode,
  values: UserFormValues,
  selectedGroupIds: Array<string>
): Array<CreateUserInput> {
  if (mode === "single") {
    return [
      buildCreateUserInput({
        context: "Single user",
        username: values.username,
        password: values.password,
        description: values.description,
        groupIds: selectedGroupIds,
      }),
    ]
  }

  if (mode === "list") {
    const lines = splitNonEmptyLines(values.listInput)

    if (lines.length === 0) {
      throw new Error("Provide at least one user")
    }

    return lines.map((line, index) => {
      const parts = line.split(",")
      if (parts.length < 2) {
        throw new Error(
          `Line ${index + 1}: expected username,password,description`
        )
      }

      return buildCreateUserInput({
        context: `Line ${index + 1}`,
        username: parts[0] ?? "",
        password: parts[1] ?? "",
        description: parts.slice(2).join(","),
        groupIds: selectedGroupIds,
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
    return buildCreateUserInput({
      context: `Generated user ${offset + 1}`,
      username: `${prefix}${String(index).padStart(width, "0")}`,
      password: values.sharedPassword,
      description: values.prefixDescription,
      groupIds: selectedGroupIds,
    })
  })
}
