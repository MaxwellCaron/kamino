import { POD_NETWORK_PROFILE_KEYS } from "@/lib/pods/pod-networking-mode"
import type { PodNetworkProfile } from "@/lib/pods/create-pod-api"
import { optionalVmidSchema } from "@/lib/vms/vmid-schema"
import { z } from "zod"

export type RouterCloneFormValues = {
  target_folder_id: string | null
  network_number: string
  network_profile_key: PodNetworkProfile["key"]
  clone_target_key: string
  vmid: number
}

export const routerCloneFormSchema = z.object({
  target_folder_id: z
    .string()
    .nullable()
    .refine(
      (value): value is string => !!value,
      "Destination folder is required"
    ),
  network_number: z
    .string()
    .trim()
    .min(1, "Inner VLAN tag is required")
    .refine(
      (value) => /^\d+$/.test(value),
      "Inner VLAN tag must be a whole number"
    )
    .transform((value) => Number.parseInt(value, 10))
    .refine(
      (value) => value >= 1 && value <= 255,
      "Inner VLAN tag must be between 1 and 255"
    ),
  network_profile_key: z.enum(POD_NETWORK_PROFILE_KEYS),
  clone_target_key: z.string().trim().min(1, "Clone target is required"),
  vmid: optionalVmidSchema,
})
