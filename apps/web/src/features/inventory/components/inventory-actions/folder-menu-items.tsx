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

type FolderCapabilities = ReturnType<typeof getFolderCapabilities>

type FolderPowerConfig = {
  targetCount: number
  onPowerAction: (action: InventoryPowerAction) => void
}

function FolderCreateMenuItems({
  capabilities,
  disabled,
  onCreateFolder,
  onCreateVm,
}: {
  capabilities: FolderCapabilities
  disabled?: boolean
  onCreateFolder: () => void
  onCreateVm: () => void
}) {
  if (!capabilities.hasCreateActions) return null

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        {capabilities.createFolder.visible ? (
          <DropdownMenuItem onClick={onCreateFolder} disabled={disabled}>
            <HugeiconsIcon
              icon={FolderAddIcon}
              className="text-muted-foreground"
            />
            New Folder
          </DropdownMenuItem>
        ) : null}
        {capabilities.createVm.visible ? (
          <DropdownMenuItem onClick={onCreateVm} disabled={disabled}>
            <HugeiconsIcon
              icon={ComputerAddIcon}
              className="text-muted-foreground"
            />
            New VM
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuGroup>
      {capabilities.hasEditActions || capabilities.delete.visible ? (
        <DropdownMenuSeparator />
      ) : null}
    </>
  )
}

function FolderPowerMenuItems({
  capabilities,
  disabled,
  power,
}: {
  capabilities: FolderCapabilities
  disabled?: boolean
  power: FolderPowerConfig | null
}) {
  if (!power || power.targetCount === 0) return null

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Power</DropdownMenuLabel>
        {FOLDER_POWER_ACTION_DEFINITIONS.map((definition) => (
          <DropdownMenuItem
            key={definition.action}
            variant={definition.action === "stop" ? "destructive" : "default"}
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
      {capabilities.hasCreateActions ||
      capabilities.hasEditActions ||
      capabilities.delete.visible ? (
        <DropdownMenuSeparator />
      ) : null}
    </>
  )
}

function FolderEditMenuItems({
  capabilities,
  disabled,
  onEditLimit,
  onManagePermissions,
  onRename,
}: {
  capabilities: FolderCapabilities
  disabled?: boolean
  onEditLimit: () => void
  onManagePermissions: () => void
  onRename: () => void
}) {
  if (!capabilities.hasEditActions) return null

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Edit</DropdownMenuLabel>
        {capabilities.rename.visible ? (
          <DropdownMenuItem onClick={onRename} disabled={disabled}>
            <HugeiconsIcon
              icon={PencilEdit01Icon}
              className="text-muted-foreground"
            />
            Edit
          </DropdownMenuItem>
        ) : null}
        {capabilities.managePermissions.visible ? (
          <DropdownMenuItem onClick={onEditLimit} disabled={disabled}>
            <HugeiconsIcon icon={GaugeIcon} className="text-muted-foreground" />
            Limit
          </DropdownMenuItem>
        ) : null}
        {capabilities.managePermissions.visible ? (
          <DropdownMenuItem
            onClick={onManagePermissions}
            disabled={disabled}
          >
            <HugeiconsIcon icon={LockedIcon} className="text-muted-foreground" />
            Permissions
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuGroup>
      {capabilities.delete.visible ? <DropdownMenuSeparator /> : null}
    </>
  )
}

function FolderDeleteMenuItem({
  capabilities,
  disabled,
  onDelete,
}: {
  capabilities: FolderCapabilities
  disabled?: boolean
  onDelete: () => void
}) {
  if (!capabilities.delete.visible) return null

  return (
    <DropdownMenuItem
      variant="destructive"
      onClick={onDelete}
      disabled={disabled}
    >
      <HugeiconsIcon icon={Delete01Icon} />
      Delete
    </DropdownMenuItem>
  )
}

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
  power: FolderPowerConfig | null
  onCreateVm: () => void
  onCreateFolder: () => void
  onManagePermissions: () => void
  onEditLimit: () => void
  onRename: () => void
  onDelete: () => void
  disabled?: boolean
}) {
  const capabilities = getFolderCapabilities(permissions)

  return (
    <>
      <FolderCreateMenuItems
        capabilities={capabilities}
        disabled={disabled}
        onCreateFolder={onCreateFolder}
        onCreateVm={onCreateVm}
      />
      <FolderPowerMenuItems
        capabilities={capabilities}
        disabled={disabled}
        power={power}
      />
      <FolderEditMenuItems
        capabilities={capabilities}
        disabled={disabled}
        onEditLimit={onEditLimit}
        onManagePermissions={onManagePermissions}
        onRename={onRename}
      />
      <FolderDeleteMenuItem
        capabilities={capabilities}
        disabled={disabled}
        onDelete={onDelete}
      />
    </>
  )
}
