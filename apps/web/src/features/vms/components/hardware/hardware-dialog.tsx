import { useQuery } from "@tanstack/react-query"
import { Settings01Icon } from "@hugeicons/core-free-icons"
import { Dialog } from "@workspace/ui/components/dialog"
import {
  AppDialogContent,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { DialogBodySkeleton } from "@/components/loading-skeletons"
import { inventoryItemQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  bridgesQueryOptions,
  storagesQueryOptions,
} from "@/features/vms/api/proxmox-options-api"
import { vmHardwareQueryOptions } from "@/features/vms/api/vm-api"
import { VmHardwareDialogForm } from "@/features/vms/components/hardware/hardware-dialog-form"
import { buildVmHardwareNetworkOptions } from "@/features/vms/components/hardware/hardware-section-utils"
import { formatVmReference } from "@/features/shared/utils/format"

type VmHardwareDialogProps = {
  itemId: string
  vmName: string
  vmid?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

type StorageOption = {
  storage: string
}

export function VmHardwareDialog({
  itemId,
  vmName,
  vmid: initialVmid,
  open,
  onOpenChange,
}: VmHardwareDialogProps) {
  const { data: item } = useQuery({
    ...inventoryItemQueryOptions(itemId),
    enabled: open,
  })
  const node = item?.vm?.node ?? ""
  const vmid = item?.vm?.vmid ?? 0
  const isDialogOpen = open && node !== "" && vmid > 0
  const {
    data: hardware,
    error: hardwareError,
    isError: isHardwareError,
  } = useQuery({
    ...vmHardwareQueryOptions(itemId),
    enabled: isDialogOpen,
  })
  const { data: storages, error: storagesError } = useQuery({
    ...storagesQueryOptions(node),
    enabled: isDialogOpen,
  })
  const { data: networks, error: networksError } = useQuery({
    ...bridgesQueryOptions(node, itemId),
    enabled: isDialogOpen,
  })

  const { bridgeOptions, vnetOptions, networkOptions } =
    buildVmHardwareNetworkOptions(networks ?? {})
  const storageOptions = (storages ?? []) as Array<StorageOption>
  const loadError = hardwareError ?? storagesError ?? networksError
  const isLoadError = isHardwareError || !!storagesError || !!networksError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={open}
        initialFocus={false}
        icon={Settings01Icon}
        title="Hardware"
        description={`Review and update the hardware profile for ${formatVmReference(
          initialVmid ?? vmid,
          vmName
        )}.`}
      >
        {isLoadError ? (
          <InlineErrorAlert error={loadError} fallback="Failed to load VM hardware." />
        ) : hardware ? (
          <VmHardwareDialogForm
            key={itemId}
            itemId={itemId}
            vmName={vmName}
            vmid={initialVmid ?? vmid}
            hardware={hardware}
            bridgeOptions={bridgeOptions}
            vnetOptions={vnetOptions}
            networkOptions={networkOptions}
            storageOptions={storageOptions}
            onOpenChange={onOpenChange}
          />
        ) : (
          <AppDialogScrollBody className="mb-0 h-[40vh] px-1 py-4">
            <DialogBodySkeleton rows={4} />
          </AppDialogScrollBody>
        )}
      </AppDialogContent>
    </Dialog>
  )
}
