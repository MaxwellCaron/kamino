import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDataTransferHorizontalIcon,
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

type VmCapabilities = ReturnType<typeof getVmCapabilities>
type VmPowerActions = ReturnType<typeof useVmPowerActions>

function VmPowerMenuItems({
  capabilities,
  onAction,
  powerActions,
}: {
  capabilities: VmCapabilities
  onAction: (config: ConfirmConfig) => void
  powerActions: VmPowerActions
}) {
  if (powerActions.powerMode === null) return null

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Power</DropdownMenuLabel>
        {powerActions.actions.map((action) => (
          <DropdownMenuItem
            key={action.action}
            variant={action.action === "stop" ? "destructive" : "default"}
            disabled={action.disabled}
            onClick={() => powerActions.openPowerAction(action.action, onAction)}
          >
            <HugeiconsIcon
              icon={action.icon}
              className="text-muted-foreground"
            />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
      {capabilities.hasActionItems ||
      capabilities.hasEditItems ||
      capabilities.delete.visible ? (
        <DropdownMenuSeparator />
      ) : null}
    </>
  )
}

function VmActionMenuItems({
  capabilities,
  disabled,
  onClone,
  onMigrate,
  onSnapshot,
  onTemplatize,
}: {
  capabilities: VmCapabilities
  disabled?: boolean
  onClone: () => void
  onMigrate: () => void
  onSnapshot: (mode: "direct" | "request") => void
  onTemplatize: () => void
}) {
  if (!capabilities.hasActionItems) return null
  const snapshotMode = capabilities.snapshot.mode

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        {capabilities.clone.visible ? (
          <DropdownMenuItem onClick={onClone} disabled={disabled}>
            <HugeiconsIcon icon={CopyIcon} className="text-muted-foreground" />
            Clone
          </DropdownMenuItem>
        ) : null}
        {capabilities.migrate.visible ? (
          <DropdownMenuItem onClick={onMigrate} disabled={disabled}>
            <HugeiconsIcon
              icon={ArrowDataTransferHorizontalIcon}
              className="text-muted-foreground"
            />
            Migrate
          </DropdownMenuItem>
        ) : null}
        {capabilities.snapshot.visible && snapshotMode ? (
          <DropdownMenuItem
            onClick={() => onSnapshot(snapshotMode)}
            disabled={disabled}
          >
            <HugeiconsIcon
              icon={Camera01Icon}
              className="text-muted-foreground"
            />
            Snapshot
          </DropdownMenuItem>
        ) : null}
        {capabilities.template.visible ? (
          <DropdownMenuItem disabled={disabled} onClick={onTemplatize}>
            <HugeiconsIcon icon={Copy02Icon} className="text-muted-foreground" />
            Templatize
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuGroup>
      {capabilities.hasEditItems || capabilities.delete.visible ? (
        <DropdownMenuSeparator />
      ) : null}
    </>
  )
}

function VmEditMenuItems({
  capabilities,
  disabled,
  onEditHardware,
  onManagePermissions,
  onRename,
}: {
  capabilities: VmCapabilities
  disabled?: boolean
  onEditHardware: () => void
  onManagePermissions: () => void
  onRename: () => void
}) {
  if (!capabilities.hasEditItems) return null

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
        {capabilities.editHardware.visible ? (
          <DropdownMenuItem onClick={onEditHardware} disabled={disabled}>
            <HugeiconsIcon
              icon={Settings01Icon}
              className="text-muted-foreground"
            />
            Hardware
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

function VmDeleteMenuItem({
  capabilities,
  disabled,
  onDelete,
}: {
  capabilities: VmCapabilities
  disabled?: boolean
  onDelete: () => void
}) {
  if (!capabilities.delete.visible) return null

  return (
    <DropdownMenuItem
      variant="destructive"
      disabled={disabled}
      onClick={onDelete}
    >
      <HugeiconsIcon icon={Delete01Icon} />
      Delete
    </DropdownMenuItem>
  )
}

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
  onMigrate,
  onRename,
  onEditHardware,
  disabled,
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
  onMigrate: () => void
  onRename: () => void
  onEditHardware: () => void
  disabled?: boolean
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
    disabled,
  })
  const capabilities = getVmCapabilities(permissions, { guestType })
  const hasItemsAfterGeneral =
    powerActions.powerMode !== null ||
    capabilities.hasActionItems ||
    capabilities.hasEditItems ||
    capabilities.delete.visible

  const handleTemplatize = () =>
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

  const handleDelete = () =>
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
              icon: <VmIcon status={powerStatus} guestType={guestType} />,
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

  return (
    <>
      <GeneralVmMenuItems
        itemId={itemId}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        disabled={disabled}
      />
      {hasItemsAfterGeneral && <DropdownMenuSeparator />}
      <VmPowerMenuItems
        capabilities={capabilities}
        onAction={onAction}
        powerActions={powerActions}
      />
      <VmActionMenuItems
        capabilities={capabilities}
        disabled={disabled}
        onClone={onClone}
        onMigrate={onMigrate}
        onSnapshot={onSnapshot}
        onTemplatize={handleTemplatize}
      />
      <VmEditMenuItems
        capabilities={capabilities}
        disabled={disabled}
        onEditHardware={onEditHardware}
        onManagePermissions={onManagePermissions}
        onRename={onRename}
      />
      <VmDeleteMenuItem
        capabilities={capabilities}
        disabled={disabled}
        onDelete={handleDelete}
      />
    </>
  )
}
