import { z } from "zod"

const vmNamePattern = /^[a-zA-Z0-9-]+$/

export const vmNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(63, "Name must be 63 characters or less")
  .regex(vmNamePattern, "Name can only contain letters, numbers, and hyphens")
