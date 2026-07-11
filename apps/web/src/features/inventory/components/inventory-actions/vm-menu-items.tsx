import { HugeiconsIcon } from "@hugeicons/react"
import {
  Camera01Icon,
  Copy02Icon,
  CopyIcon,
  Delete01Icon,
  LockedIcon,
  PencilEdit01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { getVmCapabilities } from "../../utils/inventory-capabilities"
import { InventoryDeleteConfirmItems } from "../inventory-delete-confirm-items"
import { GeneralVmMenuItems } from "./general-vm-menu-items"
import { assertSingleItemMutationSucceeded } from "./inventory-action-utils"
import type { ApiTreeNodePermissions } from "../../types/inventory-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import { formatVmReference } from "@/features/shared/utils/format"
import {
  useConvertToTemplate,
  useDeleteVM,
} from "@/features/vms/hooks/use-vm-actions"
import { useVmPowerActions } from "@/features/vms/hooks/use-vm-power-actions"
import {
  toastDeleteVm,
  toastTemplatizeVm,
} from "@/features/vms/utils/vm-toasts"
import { VmIcon } from "@/components/status/vm-icon"

export function VmMenuItems({
  permissions,
  isFavorite,
  onToggleFavorite,
  itemId,
  vmid,
  name,
  guestType,
  onAction,
  onManagePermissions,
  onSnapshot,
  onClone,
  onRename,
  onEditHardware,
  isLoading,
  powerStatus,
}: {
  permissions: ApiTreeNodePermissions
  isFavorite?: boolean
  onToggleFavorite?: () => void
  itemId: string
  vmid: number
  name?: string
  guestType?: "qemu" | "lxc"
  onAction: (config: ConfirmConfig) => void
  onManagePermissions: () => void
  onSnapshot: (mode: "direct" | "request") => void
  onClone: () => void
  onRename: () => void
  onEditHardware: () => void
  isLoading?: boolean
  powerStatus?: string
}) {
  const deleteVm = useDeleteVM()
  const toTemplate = useConvertToTemplate()
  const powerActions = useVmPowerActions({
    itemId,
    permissions,
    powerStatus,
    vmid,
    vmName: name,
    isLoading,
  })
  const capabilities = getVmCapabilities(permissions, { guestType })
  const hasActionItems = capabilities.hasActionItems
  const hasItemsAfterGeneral =
    powerActions.powerMode !== null ||
    hasActionItems ||
    capabilities.hasEditItems ||
    capabilities.delete.visible

  return (
    <>
      <GeneralVmMenuItems
        itemId={itemId}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        isLoading={isLoading}
      />
      {hasItemsAfterGeneral && <DropdownMenuSeparator />}
      {powerActions.powerMode !== null && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Power</DropdownMenuLabel>
            {powerActions.actions.map((action) => {
              return (
                <DropdownMenuItem
                  key={action.action}
                  variant={action.action === "stop" ? "destructive" : "default"}
                  disabled={action.disabled}
                  onClick={() =>
                    powerActions.openPowerAction(action.action, onAction)
                  }
                >
                  <HugeiconsIcon
                    icon={action.icon}
                    className="text-muted-foreground"
                  />
                  {action.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
          {(hasActionItems ||
            capabilities.hasEditItems ||
            capabilities.delete.visible) && <DropdownMenuSeparator />}
        </>
      )}
      {hasActionItems && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {capabilities.clone.visible && (
              <DropdownMenuItem onClick={onClone} disabled={isLoading}>
                <HugeiconsIcon
                  icon={CopyIcon}
                  className="text-muted-foreground"
                />
                Clone
              </DropdownMenuItem>
            )}
            {capabilities.snapshot.visible && (
              <DropdownMenuItem
                onClick={() => {
                  if (capabilities.snapshot.mode) {
                    onSnapshot(capabilities.snapshot.mode)
                  }
                }}
                disabled={isLoading}
              >
                <HugeiconsIcon
                  icon={Camera01Icon}
                  className="text-muted-foreground"
                />
                Snapshot
              </DropdownMenuItem>
            )}
            {capabilities.template.visible && (
              <DropdownMenuItem
                disabled={isLoading}
                onClick={() =>
                  onAction({
                    title: "Templatize",
                    icon: Copy02Icon,
                    description: `This will convert ${formatVmReference(vmid, name)} to a template. Once a VM is converted to a template, you will not be able to make any additional edits to this VM.`,
                    actionLabel: "Templatize",
                    variant: "destructive",
                    onConfirm: () => {
                      const promise = toTemplate
                        .mutateAsync({ itemIds: [itemId] })
                        .then((result) =>
                          assertSingleItemMutationSucceeded(
                            result,
                            `Failed to templatize VM ${vmid}`
                          )
                        )

                      toastTemplatizeVm(promise, vmid, name)
                    },
                  })
                }
              >
                <HugeiconsIcon
                  icon={Copy02Icon}
                  className="text-muted-foreground"
                />
                Templatize
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {(capabilities.hasEditItems || capabilities.delete.visible) && (
            <DropdownMenuSeparator />
          )}
        </>
      )}
      {capabilities.hasEditItems && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Edit</DropdownMenuLabel>
            {capabilities.rename.visible && (
              <DropdownMenuItem onClick={onRename} disabled={isLoading}>
                <HugeiconsIcon
                  icon={PencilEdit01Icon}
                  className="text-muted-foreground"
                />
                Edit
              </DropdownMenuItem>
            )}
            {capabilities.editHardware.visible && (
              <DropdownMenuItem onClick={onEditHardware} disabled={isLoading}>
                <HugeiconsIcon
                  icon={Settings01Icon}
                  className="text-muted-foreground"
                />
                Hardware
              </DropdownMenuItem>
            )}
            {capabilities.managePermissions.visible && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <HugeiconsIcon
                  icon={LockedIcon}
                  className="text-muted-foreground"
                />
                Permissions
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {capabilities.delete.visible && <DropdownMenuSeparator />}
        </>
      )}
      {capabilities.delete.visible && (
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoading}
          onClick={() =>
            onAction({
              title: "Delete",
              icon: Delete01Icon,
              description: `This will permanently delete ${formatVmReference(vmid, name)}.`,
              body: (
                <InventoryDeleteConfirmItems
                  items={[
                    {
                      id: itemId,
                      name: formatVmReference(vmid, name),
                      icon: (
                        <VmIcon status={powerStatus} guestType={guestType} />
                      ),
                    },
                  ]}
                />
              ),
              actionLabel: "Delete",
              variant: "destructive",
              onConfirm: () => {
                const promise = deleteVm
                  .mutateAsync({ itemIds: [itemId] })
                  .then((result) =>
                    assertSingleItemMutationSucceeded(
                      result,
                      `Failed to delete VM ${vmid}`
                    )
                  )

                toastDeleteVm(promise, vmid, name)
              },
            })
          }
        >
          <HugeiconsIcon icon={Delete01Icon} />
          Delete
        </DropdownMenuItem>
      )}
    </>
  )
}
