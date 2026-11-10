import { z } from "zod"

export const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(63, "Name must be 63 characters or less")
  .regex(/^[a-zA-Z]/, "Name must start with a letter")
  .regex(
    /^[a-zA-Z0-9-]+$/,
    "Name can only contain letters, numbers, and hyphens"
  )

export const folderDescriptionSchema = z
  .string()
  .trim()
  .max(256, "Max 256 characters")
