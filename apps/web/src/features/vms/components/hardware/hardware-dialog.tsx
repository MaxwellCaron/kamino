import { useQuery } from "@tanstack/react-query"
import { IconSettings } from "@tabler/icons-react"
import { Dialog } from "@workspace/ui/components/dialog"
import {
  AppDialogContent,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
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
  const { data: storages } = useQuery({
    ...storagesQueryOptions(node),
    enabled: isDialogOpen,
  })
  const { data: networks } = useQuery({
    ...bridgesQueryOptions(node),
    enabled: isDialogOpen,
  })

  const { bridgeOptions, vnetOptions, networkOptions } =
    buildVmHardwareNetworkOptions(networks ?? {})
  const storageOptions = (storages ?? []) as Array<StorageOption>

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={open}
        initialFocus={false}
        icon={IconSettings}
        title="Hardware"
        description={`Review and update the hardware profile for ${formatVmReference(
          initialVmid ?? vmid,
          vmName
        )}.`}
      >
        {isHardwareError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {hardwareError instanceof Error
              ? hardwareError.message
              : "Failed to load VM hardware."}
          </div>
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
