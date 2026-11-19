import {
  vmHardwareConfigurationSchema,
  vmNetworkInterfaceSchema,
} from "@/lib/vms/vm-hardware-schema"
import type { ApiVmHardwareConfig } from "@/lib/vms/vm-types"
import { uuid } from "@/lib/uuid"
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

// Seeds exactly from current hardware; replacing an existing NIC's bridge/tag here would erase a manager override.
export function vmHardwareFormValuesFromHardware(
  hardware: ApiVmHardwareConfig
): VmHardwareDialogFormValues {
  return {
    ostype: hardware.ostype,
    bios: hardware.bios,
    machine: hardware.machine,
    scsi: hardware.scsi,
    sockets: hardware.sockets,
    cores: hardware.cores,
    cpu_type: hardware.cpu_type,
    memory: hardware.memory,
    balloon: hardware.balloon,
    storage: hardware.storage,
    disk_size: hardware.disk_size,
    networks: hardware.networks.map((network) => ({
      id: network.device ?? uuid(),
      device: network.device,
      mac_address: network.mac_address,
      bridge: network.bridge,
      model: network.model,
      vlan_tag: network.vlan_tag,
      firewall: network.firewall,
    })),
  }
}
