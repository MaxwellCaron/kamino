import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { DialogFooter } from "@workspace/ui/components/dialog"
import type { ApiVmHardwareConfig } from "@/features/vms/types/vm-types"
import type { NetworkOption } from "@/features/vms/components/hardware/hardware-section-utils"
import type {
  StorageOption,
  VmHardwareFormValues,
} from "@/features/vms/components/hardware/hardware-dialog-schema"
import {
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { getFirstIssueMessage } from "@/features/vms/components/create/create-vm-form"
import { VmHardwareComputeFields } from "@/features/vms/components/hardware/hardware-dialog-compute-fields"
import { VmHardwareOperatingSystemFields } from "@/features/vms/components/hardware/hardware-dialog-fields"
import { VmHardwareStorageFields } from "@/features/vms/components/hardware/hardware-dialog-storage-fields"
import {
  hardwareNetworkInterfaceSchema,
  vmHardwareFormSchema,
} from "@/features/vms/components/hardware/hardware-dialog-schema"
import {
  VmHardwareComputeSection,
  VmHardwareNetworkSection,
  VmHardwareOperatingSystemSection,
  VmHardwareStorageSection,
} from "@/features/vms/components/hardware/hardware-sections"
import { VmHardwareNetworksField } from "@/features/vms/components/hardware/vm-hardware-networks-field"
import { useUpdateVMHardware } from "@/features/vms/hooks/use-vm-actions"
import { toastUpdateHardware } from "@/features/vms/utils/vm-toasts"

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
        <AppDialogPrimaryButton pending={updateHardware.isPending}>
          Save
        </AppDialogPrimaryButton>
      </DialogFooter>
    </form>
  )
}
