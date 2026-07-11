import { HugeiconsIcon } from "@hugeicons/react"
import {
  CopyIcon,
  Delete01Icon,
  LockedIcon,
  PencilEdit01Icon,
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
import { useDeleteVM } from "@/features/vms/hooks/use-vm-actions"
import { VmIcon } from "@/components/status/vm-icon"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"

export function TemplateMenuItems({
  permissions,
  isFavorite,
  onToggleFavorite,
  itemId,
  vmid,
  name,
  onAction,
  onManagePermissions,
  onClone,
  onRename,
  isLoading,
}: {
  permissions: ApiTreeNodePermissions
  isFavorite?: boolean
  onToggleFavorite?: () => void
  itemId: string
  vmid: number
  name?: string
  onAction: (config: ConfirmConfig) => void
  onManagePermissions: () => void
  onClone: () => void
  onRename: () => void
  isLoading?: boolean
}) {
  const deleteVm = useDeleteVM()
  const vmIdentifier = formatVmReference(vmid, name)
  const capabilities = getVmCapabilities(permissions, { isTemplate: true })
  const hasActionItems = capabilities.clone.visible

  return (
    <>
      <GeneralVmMenuItems
        itemId={itemId}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        isLoading={isLoading}
      />
      {(hasActionItems ||
        capabilities.hasEditItems ||
        capabilities.delete.visible) && <DropdownMenuSeparator />}
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
              title: "Delete Template?",
              icon: Delete01Icon,
              description: `This will permanently delete template ${vmIdentifier}.`,
              body: (
                <InventoryDeleteConfirmItems
                  items={[
                    {
                      id: itemId,
                      name: vmIdentifier,
                      icon: <VmIcon status={undefined} isTemplate />,
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
                      `Failed to delete template ${vmIdentifier}`
                    )
                  )

                showSingleMutationToast({
                  title: "Deleting",
                  name: vmIdentifier,
                  promise,
                  successDescription: "Deleted",
                })
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
