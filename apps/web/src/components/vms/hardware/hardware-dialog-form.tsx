import {
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import {
  VmHardwareComputeSection,
  VmHardwareNetworkSection,
  VmHardwareOperatingSystemSection,
  VmHardwareStorageSection,
} from "@/components/vms/hardware/hardware-sections"
import {
  hardwareNetworkInterfaceSchema,
  vmHardwareFormSchema,
  vmHardwareFormValuesFromHardware,
} from "@/lib/vms/hardware/hardware-dialog-schema"
import type { ApiScopedNetwork } from "@/lib/vms/proxmox-options-api"
import type { ApiVmHardwareConfig } from "@/lib/vms/vm-types"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { FieldError } from "@workspace/ui/components/field"
import type { NetworkOption } from "@/lib/vms/hardware/hardware-section-utils"
import type { StorageOption } from "@/lib/vms/hardware/hardware-dialog-schema"
import { VmHardwareComputeFields } from "@/components/vms/hardware/hardware-dialog-compute-fields"
import { VmHardwareNetworksField } from "@/components/vms/hardware/vm-hardware-networks-field"
import { VmHardwareOperatingSystemFields } from "@/components/vms/hardware/hardware-dialog-fields"
import { VmHardwareStorageFields } from "@/components/vms/hardware/hardware-dialog-storage-fields"
import { getFirstIssueMessage } from "@/lib/forms/form-errors"
import { getUpdateHardwareToastOptions } from "@/lib/vms/vm-toasts"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { toast } from "sonner"
import { useForm } from "@tanstack/react-form"
import { useUpdateVMHardware } from "@/hooks/vms/use-vm-actions"

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
  scopedNetwork?: ApiScopedNetwork
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
  scopedNetwork,
}: VmHardwareDialogFormProps) {
  const updateHardware = useUpdateVMHardware(itemId)
  const minimumDiskSize = hardware.disk_size

  const form = useForm({
    defaultValues: vmHardwareFormValuesFromHardware(hardware),
    onSubmit: ({ value }) => {
      const parsed = vmHardwareFormSchema.parse(value)
      if (parsed.disk_size < minimumDiskSize) {
        toast.error("Shrinking disks is not supported.")
        return
      }

      onOpenChange(false)

      showSingleMutationToast(
        getUpdateHardwareToastOptions(
          updateHardware.mutateAsync({
            itemId,
            hardware: parsed,
          }),
          vmid,
          vmName
        )
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
              scopedNetwork={scopedNetwork}
            />
          </VmHardwareNetworkSection>
        </div>
      </AppDialogScrollBody>

      <form.Subscribe selector={(state) => state.canSubmit}>
        {(canSubmit) =>
          canSubmit ? null : (
            <FieldError>Correct the highlighted fields to continue.</FieldError>
          )
        }
      </form.Subscribe>

      <DialogFooter>
        <AppDialogPrimaryButton pending={updateHardware.isPending}>
          Save
        </AppDialogPrimaryButton>
      </DialogFooter>
    </form>
  )
}
