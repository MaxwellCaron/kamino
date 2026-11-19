import { z } from "zod"

export const optionalVmidSchema = z.union([
  z.literal(0),
  z.number().int().min(100, "VM ID must be at least 100"),
])
