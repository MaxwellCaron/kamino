import {
  vmHardwareConfigurationSchema,
  vmNetworkInterfaceSchema,
} from "@/features/vms/utils/vm-hardware-schema"
import { z } from "zod"

export const hardwareNetworkInterfaceSchema = vmNetworkInterfaceSchema.extend({
  device: z.string().trim().optional(),
  mac_address: z.string().trim().optional(),
})

export const vmHardwareFormSchema = vmHardwareConfigurationSchema.extend({
  networks: z
    .array(hardwareNetworkInterfaceSchema)
    .min(1, "At least one network interface is required")
    .max(5, "No more than 5 network interfaces are permitted."),
})

export type VmHardwareFormValues = z.infer<typeof vmHardwareFormSchema>

// UI-only row identity; vmHardwareFormSchema strips `id` before it reaches the API.
export type VmHardwareNetworkFormValue = z.infer<
  typeof hardwareNetworkInterfaceSchema
> & { id: string }

export type VmHardwareDialogFormValues = Omit<
  VmHardwareFormValues,
  "networks"
> & { networks: Array<VmHardwareNetworkFormValue> }

export type HardwareFormLike = {
  Field: any
}

export type StorageOption = {
  storage: string
}

export type StringFieldApi = {
  state: { value: string; meta?: { errors: Array<unknown> } }
  handleChange: (value: string) => void
}

export type NumberFieldApi = {
  state: { value: number; meta: { errors: Array<unknown> } }
  handleBlur: () => void
  handleChange: (value: number) => void
}
