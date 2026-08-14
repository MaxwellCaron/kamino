import { HugeiconsIcon } from "@hugeicons/react"
import {
  ComputerAddIcon,
  Delete01Icon,
  FolderAddIcon,
  GaugeIcon,
  LockedIcon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@workspace/ui/components/dropdown-menu"
import { getFolderCapabilities } from "../../utils/inventory-capabilities"
import { FOLDER_POWER_ACTION_DEFINITIONS } from "./folder-power-action-definitions"
import type { InventoryPowerAction } from "../../utils/inventory-power-actions"
import type { ApiTreeNodePermissions } from "../../types/inventory-types"

export function FolderMenuItems({
  permissions,
  power,
  onCreateVm,
  onCreateFolder,
  onManagePermissions,
  onEditLimit,
  onRename,
  onDelete,
  disabled,
}: {
  permissions: ApiTreeNodePermissions
  power: {
    targetCount: number
    onPowerAction: (action: InventoryPowerAction) => void
  } | null
  onCreateVm: () => void
  onCreateFolder: () => void
  onManagePermissions: () => void
  onEditLimit: () => void
  onRename: () => void
  onDelete: () => void
  disabled?: boolean
}) {
  const capabilities = getFolderCapabilities(permissions)
  const showPower = power !== null && power.targetCount > 0

  return (
    <>
      {capabilities.hasCreateActions && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Create</DropdownMenuLabel>
            {capabilities.createFolder.visible && (
              <DropdownMenuItem onClick={onCreateFolder} disabled={disabled}>
                <HugeiconsIcon
                  icon={FolderAddIcon}
                  className="text-muted-foreground"
                />
                New Folder
              </DropdownMenuItem>
            )}
            {capabilities.createVm.visible && (
              <DropdownMenuItem onClick={onCreateVm} disabled={disabled}>
                <HugeiconsIcon
                  icon={ComputerAddIcon}
                  className="text-muted-foreground"
                />
                New VM
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {(capabilities.hasEditActions || capabilities.delete.visible) && (
            <DropdownMenuSeparator />
          )}
        </>
      )}
      {showPower && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Power</DropdownMenuLabel>
            {FOLDER_POWER_ACTION_DEFINITIONS.map((definition) => (
              <DropdownMenuItem
                key={definition.action}
                variant={
                  definition.action === "stop" ? "destructive" : "default"
                }
                disabled={disabled}
                onClick={() => power.onPowerAction(definition.action)}
              >
                <HugeiconsIcon
                  icon={definition.icon}
                  className="text-muted-foreground"
                />
                {definition.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {(capabilities.hasCreateActions ||
            capabilities.hasEditActions ||
            capabilities.delete.visible) && <DropdownMenuSeparator />}
        </>
      )}
      {capabilities.hasEditActions && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Edit</DropdownMenuLabel>
            {capabilities.rename.visible && (
              <DropdownMenuItem onClick={onRename} disabled={disabled}>
                <HugeiconsIcon
                  icon={PencilEdit01Icon}
                  className="text-muted-foreground"
                />
                Edit
              </DropdownMenuItem>
            )}
            {capabilities.managePermissions.visible && (
              <DropdownMenuItem onClick={onEditLimit} disabled={disabled}>
                <HugeiconsIcon
                  icon={GaugeIcon}
                  className="text-muted-foreground"
                />
                Limit
              </DropdownMenuItem>
            )}
            {capabilities.managePermissions.visible && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={disabled}
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
          onClick={onDelete}
          disabled={disabled}
        >
          <HugeiconsIcon icon={Delete01Icon} />
          Delete
        </DropdownMenuItem>
      )}
    </>
  )
}
