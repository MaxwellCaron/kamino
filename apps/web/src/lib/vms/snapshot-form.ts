import { z } from "zod"

export const generateSnapshotName = () =>
  `snapshot-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}Z`

const snapshotNameSchema = z
  .string()
  .trim()
  .min(1, "Snapshot name is required")
  .max(40, "Snapshot name must be 40 characters or less")
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    "Must start with a letter and contain only letters, numbers, hyphens, and underscores"
  )

export const directSnapshotSchema = z.object({
  snapname: snapshotNameSchema,
  description: z
    .string()
    .trim()
    .max(256, "Description must be 256 characters or less"),
  vmstate: z.boolean(),
})

export const createSnapshotRequestSchema = z.object({
  snapname: snapshotNameSchema,
})
