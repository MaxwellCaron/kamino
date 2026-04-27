import { createContext, useContext, useMemo, useState } from "react"
import { InventoryPermissionsDialog } from "./permissions/permissions-dialog"
import { RenameDialog } from "./rename-dialog"
import { FolderLimitDialog } from "./folder-limit-dialog"
import type { ReactNode } from "react"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { SnapshotDialogMode } from "@/features/vms/components/snapshot-dialog"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { CloneDialog } from "@/features/vms/components/clone-dialog"
import { CreateVmDialog } from "@/features/vms/components/create/create-vm-dialog"
import { VmHardwareDialog } from "@/features/vms/components/hardware/hardware-dialog"
import { SnapshotDialog } from "@/features/vms/components/snapshot-dialog"

type PermissionsDialogConfig = {
  itemId: string
  itemKind: "folder" | "vm"
  itemName: string
  itemVmid?: number
}

type CreateFolderDialogConfig = {
  parentId: string
}

type RenameFolderDialogConfig = {
  folderId: string
  currentName: string
}

type FolderLimitDialogConfig = {
  directVmLimit?: number | null
  effectiveVmLimit?: number | null
  folderId: string
  folderName: string
  vmCount?: number | null
}

type CreateVmDialogConfig = {
  initialFolderId: string
}

type SnapshotDialogConfig = {
  itemId: string
  currentName?: string
  currentVmid?: number
  mode?: SnapshotDialogMode
}

type CloneDialogConfig = {
  itemId: string
  currentName: string
  currentVmid?: number
}

type RenameVmDialogConfig = {
  itemId: string
  currentName: string
  currentVmid?: number
}

type EditVmHardwareDialogConfig = {
  itemId: string
  currentName: string
  currentVmid?: number
}

type InventoryDialogsContextValue = {
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

const InventoryDialogsContext =
  createContext<InventoryDialogsContextValue | null>(null)

export function useInventoryDialogs() {
  const context = useContext(InventoryDialogsContext)

  if (!context) {
    throw new Error(
      "useInventoryDialogs must be used within an InventoryDialogsProvider."
    )
  }

  return context
}

export function InventoryDialogsProvider({
  children,
}: {
  children: ReactNode
}) {
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [createFolder, setCreateFolder] =
    useState<CreateFolderDialogConfig | null>(null)
  const [renameFolder, setRenameFolder] =
    useState<RenameFolderDialogConfig | null>(null)
  const [folderLimit, setFolderLimit] =
    useState<FolderLimitDialogConfig | null>(null)
  const [createVm, setCreateVm] = useState<CreateVmDialogConfig | null>(null)
  const [snapshot, setSnapshot] = useState<SnapshotDialogConfig | null>(null)
  const [clone, setClone] = useState<CloneDialogConfig | null>(null)
  const [renameVm, setRenameVm] = useState<RenameVmDialogConfig | null>(null)
  const [editVmHardware, setEditVmHardware] =
    useState<EditVmHardwareDialogConfig | null>(null)
  const [permissions, setPermissions] =
    useState<PermissionsDialogConfig | null>(null)

  const value = useMemo<InventoryDialogsContextValue>(
    () => ({
      openConfirm: setConfirm,
      openCreateFolder: setCreateFolder,
      openRenameFolder: setRenameFolder,
      openFolderLimit: setFolderLimit,
      openCreateVm: setCreateVm,
      openSnapshot: setSnapshot,
      openClone: setClone,
      openRenameVm: setRenameVm,
      openEditVmHardware: setEditVmHardware,
      openPermissions: setPermissions,
    }),
    []
  )

  return (
    <InventoryDialogsContext.Provider value={value}>
      {children}
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
      {createFolder && (
        <RenameDialog
          mode="create-folder"
          open={true}
          parentId={createFolder.parentId}
          onOpenChange={(open) => {
            if (!open) setCreateFolder(null)
          }}
        />
      )}
      {renameFolder && (
        <RenameDialog
          mode="rename-folder"
          currentName={renameFolder.currentName}
          folderId={renameFolder.folderId}
          open={true}
          onOpenChange={(open) => {
            if (!open) setRenameFolder(null)
          }}
        />
      )}
      {folderLimit && (
        <FolderLimitDialog
          directVmLimit={folderLimit.directVmLimit}
          effectiveVmLimit={folderLimit.effectiveVmLimit}
          folderId={folderLimit.folderId}
          folderName={folderLimit.folderName}
          open={true}
          onOpenChange={(open) => {
            if (!open) setFolderLimit(null)
          }}
        />
      )}
      {createVm && (
        <CreateVmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setCreateVm(null)
          }}
          initialFolderId={createVm.initialFolderId}
        />
      )}
      {snapshot && (
        <SnapshotDialog
          itemId={snapshot.itemId}
          vmid={snapshot.currentVmid}
          vmName={snapshot.currentName}
          mode={snapshot.mode}
          open={true}
          onOpenChange={(open) => {
            if (!open) setSnapshot(null)
          }}
        />
      )}
      {clone && (
        <CloneDialog
          itemId={clone.itemId}
          currentName={clone.currentName}
          currentVmid={clone.currentVmid}
          open={true}
          onOpenChange={(open) => {
            if (!open) setClone(null)
          }}
        />
      )}
      {renameVm && (
        <RenameDialog
          mode="rename-item"
          itemId={renameVm.itemId}
          currentName={renameVm.currentName}
          currentVmid={renameVm.currentVmid}
          open={true}
          onOpenChange={(open) => {
            if (!open) setRenameVm(null)
          }}
        />
      )}
      {editVmHardware && (
        <VmHardwareDialog
          key={editVmHardware.itemId}
          itemId={editVmHardware.itemId}
          vmName={editVmHardware.currentName}
          vmid={editVmHardware.currentVmid}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditVmHardware(null)
          }}
        />
      )}
      {permissions && (
        <InventoryPermissionsDialog
          itemId={permissions.itemId}
          itemKind={permissions.itemKind}
          itemName={permissions.itemName}
          itemVmid={permissions.itemVmid}
          open={true}
          onOpenChange={(open) => {
            if (!open) setPermissions(null)
          }}
        />
      )}
    </InventoryDialogsContext.Provider>
  )
}
