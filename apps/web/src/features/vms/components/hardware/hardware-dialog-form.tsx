import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { z } from "zod"
import type { ApiVmHardwareConfig } from "@/features/vms/types/vm-types"
import type { NetworkOption } from "@/features/vms/components/hardware/hardware-section-utils"
import {
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { getFirstIssueMessage } from "@/features/vms/components/create/create-vm-form"
import {
  VmHardwareComputeFields,
  VmHardwareOperatingSystemFields,
  VmHardwareStorageFields,
} from "@/features/vms/components/hardware/hardware-dialog-fields"
import {
  VmHardwareComputeSection,
  VmHardwareNetworkSection,
  VmHardwareOperatingSystemSection,
  VmHardwareStorageSection,
} from "@/features/vms/components/hardware/hardware-sections"
import { VmHardwareNetworksField } from "@/features/vms/components/hardware/vm-hardware-networks-field"
import { useUpdateVMHardware } from "@/features/vms/hooks/use-vm-actions"
import { toastUpdateHardware } from "@/features/vms/utils/vm-toasts"

const hardwareNetworkInterfaceSchema = z.object({
  device: z.string().trim().optional(),
  mac_address: z.string().trim().optional(),
  bridge: z.string().trim().min(1, "Network bridge is required"),
  model: z.string().trim().min(1, "NIC model is required"),
  vlan_tag: z.number().int().min(1).max(4094).optional(),
  firewall: z.boolean(),
})

export const vmHardwareFormSchema = z.object({
  ostype: z.string().trim().min(1, "OS type is required"),
  bios: z.string().trim().min(1, "BIOS is required"),
  machine: z.string().trim().min(1, "Machine type is required"),
  scsi: z.string().trim().min(1, "SCSI controller is required"),
  sockets: z.number().int().min(1, "At least one socket is required"),
  cores: z.number().int().min(1, "At least one core is required"),
  cpu_type: z.string().trim().min(1, "CPU type is required"),
  memory: z.number().int().min(1, "Memory must be at least 1 GB"),
  balloon: z.number().int().min(0, "Balloon must be 0 GB or higher"),
  storage: z.string().trim().min(1, "Disk storage is required"),
  disk_size: z.number().int().min(1, "Disk size must be at least 1 GB"),
  networks: z
    .array(hardwareNetworkInterfaceSchema)
    .min(1, "At least one network interface is required")
    .max(5, "No more than 5 network interfaces are permitted."),
})

export type VmHardwareFormValues = z.infer<typeof vmHardwareFormSchema>

type StorageOption = {
  storage: string
}

type VmHardwareDialogFormProps = {
  itemId: string
  vmName: string
  vmid?: number
  hardware: ApiVmHardwareConfig
  bridgeOptions: Array<NetworkOption>
  vnetOptions: Array<NetworkOption>
  networkOptions: Array<NetworkOption>
  storageOptions: Array<StorageOption>
  onOpenChange: (open: boolean) => void
}

function toFormValues(hardware: ApiVmHardwareConfig): VmHardwareFormValues {
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
      device: network.device,
      mac_address: network.mac_address,
      bridge: network.bridge,
      model: network.model,
      vlan_tag: network.vlan_tag,
      firewall: network.firewall,
    })),
  }
}

export function VmHardwareDialogForm({
  itemId,
  vmName,
  vmid,
  hardware,
  bridgeOptions,
  vnetOptions,
  networkOptions,
  storageOptions,
  onOpenChange,
}: VmHardwareDialogFormProps) {
  const updateHardware = useUpdateVMHardware(itemId)
  const minimumDiskSize = hardware.disk_size

  const form = useForm({
    defaultValues: toFormValues(hardware),
    onSubmit: ({ value }) => {
      const parsed = vmHardwareFormSchema.parse(value)
      if (parsed.disk_size < minimumDiskSize) {
        toast.error("Shrinking disks is not supported.")
        return
      }

      onOpenChange(false)

      toastUpdateHardware(
        updateHardware.mutateAsync({
          itemId,
          hardware: parsed,
        }),
        vmid,
        vmName
      )
    },
  })

  return (
    <form
      noValidate
      action={() => {
        void form.handleSubmit()
      }}
    >
      <AppDialogScrollBody className="h-[40vh]">
        <div className="flex flex-col gap-6">
          <VmHardwareOperatingSystemSection description="Review the guest OS type, firmware, and chipset settings.">
            <VmHardwareOperatingSystemFields form={form} />
          </VmHardwareOperatingSystemSection>

          <VmHardwareComputeSection description="Configure the CPU topology and memory profile.">
            <VmHardwareComputeFields form={form} />
          </VmHardwareComputeSection>

          <VmHardwareStorageSection>
            <VmHardwareStorageFields
              form={form}
              minimumDiskSize={minimumDiskSize}
              storageOptions={storageOptions}
            />
          </VmHardwareStorageSection>

          <VmHardwareNetworkSection>
            <VmHardwareNetworksField
              form={form}
              bridgeOptions={bridgeOptions}
              vnetOptions={vnetOptions}
              networkOptions={networkOptions}
              validateBridge={(value) =>
                getFirstIssueMessage(
                  hardwareNetworkInterfaceSchema.shape.bridge.safeParse(value)
                )
              }
            />
          </VmHardwareNetworkSection>
        </div>
      </AppDialogScrollBody>

      <DialogFooter>
        <AppDialogPrimaryButton disabled={updateHardware.isPending}>
          {updateHardware.isPending ? "Saving..." : "Save"}
        </AppDialogPrimaryButton>
      </DialogFooter>
    </form>
  )
}
