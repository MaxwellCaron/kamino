import { z } from "zod"

export type CreateMode = "single" | "list" | "prefix"

export const descriptionFieldSchema = z
  .string()
  .trim()
  .max(256, "Max 256 characters")

export const descriptionSchema = descriptionFieldSchema.optional()

export const prefixSchema = z.string().trim().min(1, "Prefix is required")

export const positiveIntegerStringSchema = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be a positive whole number`)
    .refine((value) => Number.parseInt(value, 10) >= 1, {
      message: `${label} must be a positive whole number`,
    })

export function parsePositiveIntegerString(value: string, label: string) {
  return Number.parseInt(positiveIntegerStringSchema(label).parse(value), 10)
}

export function normalizeDescription(description: string) {
  const value = description.trim()
  return value.length > 0 ? value : undefined
}

export function splitNonEmptyLines(value: string) {
  return value.split("\n").flatMap((line) => {
    const trimmed = line.trim()
    return trimmed ? [trimmed] : []
  })
}
