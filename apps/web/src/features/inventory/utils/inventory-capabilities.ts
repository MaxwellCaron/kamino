import {
  InventoryPermissionBits,
  canRequestInventoryPermission,
  hasInventoryPermission,
} from "./inventory-permissions"
import type {
  ApiTreeNode,
  ApiTreeNodePermissions,
} from "../types/inventory-types"
import type { InventoryPermissionKey } from "./inventory-permissions"

export type InventoryCapabilityMode = "direct" | "request" | null

export type InventoryCapability = {
  enabled: boolean
  mode: InventoryCapabilityMode
  visible: boolean
}

const FOLDER_ACTION_PERMISSION_KEYS = [
  "createFolder",
  "createVm",
  "renameFolder",
  "deleteFolder",
  "managePermissions",
] satisfies Array<InventoryPermissionKey>

function getPermissionBit(permission: InventoryPermissionKey | number) {
  return typeof permission === "number"
    ? permission
    : InventoryPermissionBits[permission]
}

function directCapability(enabled: boolean): InventoryCapability {
  return {
    enabled,
    mode: enabled ? "direct" : null,
    visible: enabled,
  }
}

function modeCapability(mode: InventoryCapabilityMode): InventoryCapability {
  return {
    enabled: mode !== null,
    mode,
    visible: mode !== null,
  }
}

export function getInventoryPermissionMode(
  permissions: ApiTreeNodePermissions | undefined,
  permission: InventoryPermissionKey | number
): InventoryCapabilityMode {
  const bit = getPermissionBit(permission)

  if (hasInventoryPermission(permissions, bit)) {
    return "direct"
  }

  if (canRequestInventoryPermission(permissions, bit)) {
    return "request"
  }

  return null
}

export function hasDirectInventoryCapability(
  permissions: ApiTreeNodePermissions | undefined,
  permission: InventoryPermissionKey | number
) {
  return hasInventoryPermission(permissions, getPermissionBit(permission))
}

function getDirectInventoryCapability(
  permissions: ApiTreeNodePermissions | undefined,
  permission: InventoryPermissionKey | number
) {
  return directCapability(hasDirectInventoryCapability(permissions, permission))
}

function getRequestableInventoryCapability(
  permissions: ApiTreeNodePermissions | undefined,
  permission: InventoryPermissionKey | number
) {
  return modeCapability(getInventoryPermissionMode(permissions, permission))
}

function hasAnyDirectInventoryCapability(
  permissions: ApiTreeNodePermissions | undefined,
  permissionsToCheck: Array<InventoryPermissionKey | number>
) {
  return permissionsToCheck.some((permission) =>
    hasDirectInventoryCapability(permissions, permission)
  )
}

export function getFolderCapabilities(
  permissions: ApiTreeNodePermissions | undefined
) {
  const createFolder = getDirectInventoryCapability(permissions, "createFolder")
  const createVm = getDirectInventoryCapability(permissions, "createVm")
  const rename = getDirectInventoryCapability(permissions, "renameFolder")
  const deleteFolder = getDirectInventoryCapability(permissions, "deleteFolder")
  const managePermissions = getDirectInventoryCapability(
    permissions,
    "managePermissions"
  )

  const hasCreateActions = createFolder.visible || createVm.visible
  const hasEditActions = rename.visible || managePermissions.visible

  return {
    createFolder,
    createVm,
    delete: deleteFolder,
    hasActions: hasCreateActions || hasEditActions || deleteFolder.visible,
    hasCreateActions,
    hasEditActions,
    managePermissions,
    rename,
  }
}

export function getVmCapabilities(
  permissions: ApiTreeNodePermissions | undefined,
  options: { guestType?: "qemu" | "lxc"; isTemplate?: boolean } = {}
) {
  const isLxc = options.guestType === "lxc"
  const clone = isLxc
    ? directCapability(false)
    : getDirectInventoryCapability(permissions, "cloneVm")
  const console = options.isTemplate
    ? directCapability(false)
    : getDirectInventoryCapability(permissions, "consoleVm")
  const deleteVm = getDirectInventoryCapability(permissions, "deleteVm")
  const editHardware =
    options.isTemplate || isLxc
      ? directCapability(false)
      : getDirectInventoryCapability(permissions, "editVmHardware")
  const managePermissions = getDirectInventoryCapability(
    permissions,
    "managePermissions"
  )
  const notes = getDirectInventoryCapability(permissions, "renameVm")
  const power = options.isTemplate
    ? modeCapability(null)
    : getRequestableInventoryCapability(permissions, "powerVm")
  const rename = getDirectInventoryCapability(permissions, "renameVm")
  const snapshot = options.isTemplate
    ? modeCapability(null)
    : getRequestableInventoryCapability(permissions, "snapshotVm")
  const template =
    options.isTemplate || isLxc
      ? directCapability(false)
      : getDirectInventoryCapability(permissions, "templateVm")
  const viewSnapshots = getDirectInventoryCapability(
    permissions,
    "viewSnapshots"
  )

  const hasActionItems = clone.visible || snapshot.visible || template.visible
  const hasEditItems =
    rename.visible || editHardware.visible || managePermissions.visible

  return {
    clone,
    console,
    delete: deleteVm,
    editHardware,
    hasActionItems,
    hasActions:
      power.visible ||
      hasActionItems ||
      hasEditItems ||
      deleteVm.visible ||
      viewSnapshots.visible ||
      console.visible,
    hasEditItems,
    managePermissions,
    notes,
    power,
    rename,
    snapshot,
    template,
    viewSnapshots,
  }
}

export function hasFolderActions(
  permissions: ApiTreeNodePermissions | undefined
) {
  return hasAnyDirectInventoryCapability(
    permissions,
    FOLDER_ACTION_PERMISSION_KEYS
  )
}

export function hasNodeActions(data: ApiTreeNode) {
  if (data.kind === "folder") {
    return getFolderCapabilities(data.permissions).hasActions
  }

  return true
}
