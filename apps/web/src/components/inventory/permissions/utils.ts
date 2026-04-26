import type { ApiTreeNode, ApiTreeNodePermissions } from "@/lib/queries"
import {
  InventoryPermissionBits,
  canRequestInventoryPermission,
  hasInventoryPermission,
} from "@/lib/inventory-permissions"

export type InventoryPermissionMode = "direct" | "request" | null

export function getInventoryPermissionMode(
  permissions: ApiTreeNodePermissions | undefined,
  requiredPermission: number
): InventoryPermissionMode {
  if (hasInventoryPermission(permissions, requiredPermission)) {
    return "direct"
  }

  if (canRequestInventoryPermission(permissions, requiredPermission)) {
    return "request"
  }

  return null
}

export function hasAnyInventoryPermission(
  permissions: ApiTreeNodePermissions,
  requiredPermissions: Array<number>
) {
  return requiredPermissions.some((permission) =>
    hasInventoryPermission(permissions, permission)
  )
}

const FOLDER_ACTION_PERMISSIONS = [
  InventoryPermissionBits.createFolder,
  InventoryPermissionBits.createVm,
  InventoryPermissionBits.renameFolder,
  InventoryPermissionBits.deleteFolder,
  InventoryPermissionBits.managePermissions,
]

export function hasFolderActions(permissions: ApiTreeNodePermissions) {
  return hasAnyInventoryPermission(permissions, FOLDER_ACTION_PERMISSIONS)
}

export function hasNodeActions(data: ApiTreeNode) {
  return data.kind === "folder" ? hasFolderActions(data.permissions) : true
}
