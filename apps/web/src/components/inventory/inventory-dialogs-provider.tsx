import { createContext, useContext, useMemo, useState } from "react"
import { InventoryPermissionsDialog } from "./permissions/permissions-dialog"
import { ConfirmDialog } from "./inventory-confirm-actions"
import { RenameDialog } from "./rename-dialog"
import { FolderDialog } from "./folder-dialog"
import type { ReactNode } from "react"
import type { ConfirmConfig } from "./inventory-confirm-actions"
import { CloneDialog } from "@/components/vm/clone-dialog"
import { CreateVmDialog } from "@/components/vm/create/dialog"
import { VmHardwareDialog } from "@/components/vm/hardware/dialog"
import { SnapshotDialog } from "@/components/vm/snapshot-dialog"

type PermissionsDialogConfig = {
  itemId: string
  itemKind: "folder" | "vm"
  itemName: string
}

type CreateFolderDialogConfig = {
  parentId: string
}

type RenameFolderDialogConfig = {
  folderId: string
  currentName: string
}

type CreateVmDialogConfig = {
  initialFolderId: string
}

type SnapshotDialogConfig = {
  node: string
  vmid: number
}

type CloneDialogConfig = {
  node: string
  vmid: number
  currentName: string
  sourceItemId: string
}

type RenameVmDialogConfig = {
  node: string
  vmid: number
  currentName: string
}

type EditVmHardwareDialogConfig = {
  node: string
  vmid: number
  currentName: string
}

type InventoryDialogsContextValue = {
  openConfirm: (config: ConfirmConfig) => void
  openCreateFolder: (config: CreateFolderDialogConfig) => void
  openRenameFolder: (config: RenameFolderDialogConfig) => void
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
      <FolderDialog
        mode="create"
        open={createFolder !== null}
        onOpenChange={(open) => {
          if (!open) setCreateFolder(null)
        }}
        parentId={createFolder?.parentId}
      />
      <FolderDialog
        mode="rename"
        currentName={renameFolder?.currentName ?? ""}
        folderId={renameFolder?.folderId}
        open={renameFolder !== null}
        onOpenChange={(open) => {
          if (!open) setRenameFolder(null)
        }}
      />
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
          node={snapshot.node}
          vmid={snapshot.vmid}
          open={true}
          onOpenChange={(open) => {
            if (!open) setSnapshot(null)
          }}
        />
      )}
      {clone && (
        <CloneDialog
          node={clone.node}
          vmid={clone.vmid}
          currentName={clone.currentName}
          sourceItemId={clone.sourceItemId}
          open={true}
          onOpenChange={(open) => {
            if (!open) setClone(null)
          }}
        />
      )}
      {renameVm && (
        <RenameDialog
          node={renameVm.node}
          vmid={renameVm.vmid}
          currentName={renameVm.currentName}
          open={true}
          onOpenChange={(open) => {
            if (!open) setRenameVm(null)
          }}
        />
      )}
      {editVmHardware && (
        <VmHardwareDialog
          key={`${editVmHardware.node}:${editVmHardware.vmid}`}
          node={editVmHardware.node}
          vmid={editVmHardware.vmid}
          vmName={editVmHardware.currentName}
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
          open={true}
          onOpenChange={(open) => {
            if (!open) setPermissions(null)
          }}
        />
      )}
    </InventoryDialogsContext.Provider>
  )
}
