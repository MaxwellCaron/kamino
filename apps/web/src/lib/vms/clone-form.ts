import { optionalVmNameSchema } from "@/lib/vms/create/create-vm-form"
import { optionalVmidSchema } from "@/lib/vms/vmid-schema"
import { z } from "zod"

export const cloneSchema = z.object({
  target_folder_id: z
    .string()
    .nullable()
    .refine((value) => !!value, "Destination folder is required"),
  node: z.string().trim().default(""),
  newid: optionalVmidSchema,
  name: optionalVmNameSchema,
  full: z.boolean(),
})
