import { createContext, use } from "react"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { SnapshotDialogMode } from "@/features/vms/components/snapshot-dialog"

export type PermissionsDialogConfig = {
  itemId: string
  itemKind: "folder" | "vm"
  itemName: string
  itemVmid?: number
}

export type CreateFolderDialogConfig = {
  parentId: string
}

export type RenameFolderDialogConfig = {
  folderId: string
  currentName: string
  currentDescription?: string | null
}

export type FolderLimitDialogConfig = {
  directVmLimit?: number | null
  effectiveVmLimit?: number | null
  folderId: string
  folderName: string
  vmCount?: number | null
}

export type CreateVmDialogConfig = {
  initialFolderId: string
}

export type SnapshotDialogConfig = {
  itemId: string
  currentName?: string
  currentVmid?: number
  guestType?: "qemu" | "lxc"
  mode?: SnapshotDialogMode
}

export type CloneDialogConfig = {
  itemId: string
  currentName: string
  currentVmid?: number
  isTemplate?: boolean
}

export type RenameVmDialogConfig = {
  itemId: string
  currentName: string
  currentVmid?: number
}

export type EditVmHardwareDialogConfig = {
  itemId: string
  currentName: string
  currentVmid?: number
}

export type InventoryDialogsContextValue = {
  openConfirm: (config: ConfirmConfig) => void
  openCreateFolder: (config: CreateFolderDialogConfig) => void
  openRenameFolder: (config: RenameFolderDialogConfig) => void
  openFolderLimit: (config: FolderLimitDialogConfig) => void
  openCreateVm: (config: CreateVmDialogConfig) => void
  openSnapshot: (config: SnapshotDialogConfig) => void
  openClone: (config: CloneDialogConfig) => void
  openRenameVm: (config: RenameVmDialogConfig) => void
  openEditVmHardware: (config: EditVmHardwareDialogConfig) => void
  openPermissions: (config: PermissionsDialogConfig) => void
}

export const InventoryDialogsContext =
  createContext<InventoryDialogsContextValue | null>(null)

export function useInventoryDialogs() {
  const context = use(InventoryDialogsContext)

  if (!context) {
    throw new Error(
      "useInventoryDialogs must be used within an InventoryDialogsProvider."
    )
  }

  return context
}
