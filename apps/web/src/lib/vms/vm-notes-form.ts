import { z } from "zod"

export const vmNotesSchema = z.object({
  notes: z.string().trim().max(256, "Notes must be 256 characters or less"),
})
