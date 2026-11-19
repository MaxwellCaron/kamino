import { z } from "zod"

export function formatLimitValue(directVmLimit?: number | null) {
  return directVmLimit == null ? "" : String(directVmLimit)
}

export function parseLimit(value: string) {
  const trimmed = value.trim()
  if (trimmed === "") return null

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined
  }

  return parsed
}

export const folderLimitFormSchema = z.object({
  limit: z
    .string()
    .refine(
      (value) => parseLimit(value) !== undefined,
      "Limit must be a whole number greater than zero."
    ),
})
