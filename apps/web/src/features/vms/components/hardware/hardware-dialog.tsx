import { useQuery } from "@tanstack/react-query"
import { Settings01Icon } from "@hugeicons/core-free-icons"
import { Dialog } from "@workspace/ui/components/dialog"
import { AppDialogContent } from "@/components/dialogs/app-dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { PreloadOverlay } from "@/components/loading-overlay"
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

function canLoadHardware(open: boolean, node: string, vmid: number) {
  return open && node !== "" && vmid > 0
}

function getHardwareLoadState({
  hardwareError,
  isHardwareError,
  isHardwareLoading,
  isItemLoading,
  isNetworksLoading,
  isStoragesLoading,
  itemError,
  networksError,
  storagesError,
}: {
  hardwareError: unknown
  isHardwareError: boolean
  isHardwareLoading: boolean
  isItemLoading: boolean
  isNetworksLoading: boolean
  isStoragesLoading: boolean
  itemError: unknown
  networksError: unknown
  storagesError: unknown
}) {
  return {
    error: itemError ?? hardwareError ?? storagesError ?? networksError,
    isError:
      !!itemError || isHardwareError || !!storagesError || !!networksError,
    isLoading:
      isItemLoading ||
      isHardwareLoading ||
      isStoragesLoading ||
      isNetworksLoading,
  }
}

function HardwareDialogBody({
  bridgeOptions,
  hardware,
  isLoadError,
  isLoading,
  itemId,
  loadError,
  networkOptions,
  onOpenChange,
  scopedNetwork,
  storageOptions,
  vmid,
  vmName,
  vnetOptions,
}: {
  bridgeOptions: Parameters<typeof VmHardwareDialogForm>[0]["bridgeOptions"]
  hardware: Parameters<typeof VmHardwareDialogForm>[0]["hardware"] | undefined
  isLoadError: boolean
  isLoading: boolean
  itemId: string
  loadError: unknown
  networkOptions: Parameters<typeof VmHardwareDialogForm>[0]["networkOptions"]
  onOpenChange: (open: boolean) => void
  scopedNetwork: Parameters<typeof VmHardwareDialogForm>[0]["scopedNetwork"]
  storageOptions: Array<StorageOption>
  vmid: number
  vmName: string
  vnetOptions: Parameters<typeof VmHardwareDialogForm>[0]["vnetOptions"]
}) {
  if (isLoadError) {
    return (
      <InlineErrorAlert
        error={loadError}
        fallback="Failed to load VM hardware."
      />
    )
  }

  if (hardware) {
    return (
      <VmHardwareDialogForm
        key={itemId}
        itemId={itemId}
        vmName={vmName}
        vmid={vmid}
        hardware={hardware}
        bridgeOptions={bridgeOptions}
        vnetOptions={vnetOptions}
        networkOptions={networkOptions}
        storageOptions={storageOptions}
        onOpenChange={onOpenChange}
        scopedNetwork={scopedNetwork}
      />
    )
  }

  return isLoading ? null : (
    <InlineErrorAlert fallback="Failed to load VM hardware." />
  )
}

export function VmHardwareDialog({
  itemId,
  vmName,
  vmid: initialVmid,
  open,
  onOpenChange,
}: VmHardwareDialogProps) {
  const {
    data: item,
    error: itemError,
    isLoading: isItemLoading,
  } = useQuery({
    ...inventoryItemQueryOptions(itemId),
    enabled: open,
  })
  const node = item?.vm?.node ?? ""
  const vmid = item?.vm?.vmid ?? 0
  const isDialogOpen = canLoadHardware(open, node, vmid)
  const {
    data: hardware,
    error: hardwareError,
    isError: isHardwareError,
    isLoading: isHardwareLoading,
  } = useQuery({
    ...vmHardwareQueryOptions(itemId),
    enabled: isDialogOpen,
  })
  const {
    data: storages,
    error: storagesError,
    isLoading: isStoragesLoading,
  } = useQuery({
    ...storagesQueryOptions(node),
    enabled: isDialogOpen,
  })
  const {
    data: networks,
    error: networksError,
    isLoading: isNetworksLoading,
  } = useQuery({
    ...bridgesQueryOptions(node, itemId),
    enabled: isDialogOpen,
  })

  const { bridgeOptions, vnetOptions, networkOptions } =
    buildVmHardwareNetworkOptions(networks ?? {})
  const storageOptions = (storages ?? []) as Array<StorageOption>
  const {
    error: loadError,
    isError: isLoadError,
    isLoading: isLoadingHardware,
  } = getHardwareLoadState({
    hardwareError,
    isHardwareError,
    isHardwareLoading,
    isItemLoading,
    isNetworksLoading,
    isStoragesLoading,
    itemError,
    networksError,
    storagesError,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={open}
        icon={Settings01Icon}
        title="Hardware"
        description={`Review and update the hardware profile for ${formatVmReference(
          initialVmid ?? vmid,
          vmName
        )}.`}
      >
        <div className="min-h-[40vh]">
          <PreloadOverlay
            active={isLoadingHardware}
            label="Loading VM hardware"
          />
          <HardwareDialogBody
            bridgeOptions={bridgeOptions}
            hardware={hardware}
            isLoadError={isLoadError}
            isLoading={isLoadingHardware}
            itemId={itemId}
            loadError={loadError}
            networkOptions={networkOptions}
            onOpenChange={onOpenChange}
            scopedNetwork={networks?.scoped_network}
            storageOptions={storageOptions}
            vmid={initialVmid ?? vmid}
            vmName={vmName}
            vnetOptions={vnetOptions}
          />
        </div>
      </AppDialogContent>
    </Dialog>
  )
}
