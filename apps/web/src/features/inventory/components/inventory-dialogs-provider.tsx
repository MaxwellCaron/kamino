import { Suspense, lazy, useMemo, useReducer } from "react"
import type { ReactNode } from "react"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import {
  InventoryDialogsContext,
  type CloneDialogConfig,
  type CreateFolderDialogConfig,
  type CreateVmDialogConfig,
  type EditVmHardwareDialogConfig,
  type FolderLimitDialogConfig,
  type InventoryDialogsContextValue,
  type PermissionsDialogConfig,
  type RenameFolderDialogConfig,
  type RenameVmDialogConfig,
  type SnapshotDialogConfig,
} from "./inventory-dialogs-context"

const ConfirmDialog = lazy(() =>
  import("@/components/dialogs/confirm-dialog").then((module) => ({
    default: module.ConfirmDialog,
  }))
)
const CloneDialog = lazy(() =>
  import("@/features/vms/components/clone-dialog").then((module) => ({
    default: module.CloneDialog,
  }))
)
const CreateVmDialog = lazy(() =>
  import("@/features/vms/components/create/create-vm-dialog").then(
    (module) => ({
      default: module.CreateVmDialog,
    })
  )
)
const FolderLimitDialog = lazy(() =>
  import("./folder-limit-dialog").then((module) => ({
    default: module.FolderLimitDialog,
  }))
)
const InventoryPermissionsDialog = lazy(() =>
  import("./permissions/permissions-dialog").then((module) => ({
    default: module.InventoryPermissionsDialog,
  }))
)
const RenameDialog = lazy(() =>
  import("./rename-dialog").then((module) => ({
    default: module.RenameDialog,
  }))
)
const SnapshotDialog = lazy(() =>
  import("@/features/vms/components/snapshot-dialog").then((module) => ({
    default: module.SnapshotDialog,
  }))
)
const VmHardwareDialog = lazy(() =>
  import("@/features/vms/components/hardware/hardware-dialog").then(
    (module) => ({
      default: module.VmHardwareDialog,
    })
  )
)

type InventoryDialogsState = {
  confirm: ConfirmConfig | null
  createFolder: CreateFolderDialogConfig | null
  renameFolder: RenameFolderDialogConfig | null
  folderLimit: FolderLimitDialogConfig | null
  createVm: CreateVmDialogConfig | null
  snapshot: SnapshotDialogConfig | null
  clone: CloneDialogConfig | null
  renameVm: RenameVmDialogConfig | null
  editVmHardware: EditVmHardwareDialogConfig | null
  permissions: PermissionsDialogConfig | null
}

type InventoryDialogsAction =
  | { type: "openConfirm"; config: ConfirmConfig }
  | { type: "closeConfirm" }
  | { type: "openCreateFolder"; config: CreateFolderDialogConfig }
  | { type: "closeCreateFolder" }
  | { type: "openRenameFolder"; config: RenameFolderDialogConfig }
  | { type: "closeRenameFolder" }
  | { type: "openFolderLimit"; config: FolderLimitDialogConfig }
  | { type: "closeFolderLimit" }
  | { type: "openCreateVm"; config: CreateVmDialogConfig }
  | { type: "closeCreateVm" }
  | { type: "openSnapshot"; config: SnapshotDialogConfig }
  | { type: "closeSnapshot" }
  | { type: "openClone"; config: CloneDialogConfig }
  | { type: "closeClone" }
  | { type: "openRenameVm"; config: RenameVmDialogConfig }
  | { type: "closeRenameVm" }
  | { type: "openEditVmHardware"; config: EditVmHardwareDialogConfig }
  | { type: "closeEditVmHardware" }
  | { type: "openPermissions"; config: PermissionsDialogConfig }
  | { type: "closePermissions" }

const initialInventoryDialogsState: InventoryDialogsState = {
  confirm: null,
  createFolder: null,
  renameFolder: null,
  folderLimit: null,
  createVm: null,
  snapshot: null,
  clone: null,
  renameVm: null,
  editVmHardware: null,
  permissions: null,
}

function inventoryDialogsReducer(
  state: InventoryDialogsState,
  action: InventoryDialogsAction
): InventoryDialogsState {
  switch (action.type) {
    case "openConfirm":
      return { ...state, confirm: action.config }
    case "closeConfirm":
      return { ...state, confirm: null }
    case "openCreateFolder":
      return { ...state, createFolder: action.config }
    case "closeCreateFolder":
      return { ...state, createFolder: null }
    case "openRenameFolder":
      return { ...state, renameFolder: action.config }
    case "closeRenameFolder":
      return { ...state, renameFolder: null }
    case "openFolderLimit":
      return { ...state, folderLimit: action.config }
    case "closeFolderLimit":
      return { ...state, folderLimit: null }
    case "openCreateVm":
      return { ...state, createVm: action.config }
    case "closeCreateVm":
      return { ...state, createVm: null }
    case "openSnapshot":
      return { ...state, snapshot: action.config }
    case "closeSnapshot":
      return { ...state, snapshot: null }
    case "openClone":
      return { ...state, clone: action.config }
    case "closeClone":
      return { ...state, clone: null }
    case "openRenameVm":
      return { ...state, renameVm: action.config }
    case "closeRenameVm":
      return { ...state, renameVm: null }
    case "openEditVmHardware":
      return { ...state, editVmHardware: action.config }
    case "closeEditVmHardware":
      return { ...state, editVmHardware: null }
    case "openPermissions":
      return { ...state, permissions: action.config }
    case "closePermissions":
      return { ...state, permissions: null }
    default:
      return state
  }
}

export function InventoryDialogsProvider({
  children,
}: {
  children: ReactNode
}) {
  const [state, dispatch] = useReducer(
    inventoryDialogsReducer,
    initialInventoryDialogsState
  )

  const value = useMemo<InventoryDialogsContextValue>(
    () => ({
      openConfirm: (config) => dispatch({ type: "openConfirm", config }),
      openCreateFolder: (config) =>
        dispatch({ type: "openCreateFolder", config }),
      openRenameFolder: (config) =>
        dispatch({ type: "openRenameFolder", config }),
      openFolderLimit: (config) =>
        dispatch({ type: "openFolderLimit", config }),
      openCreateVm: (config) => dispatch({ type: "openCreateVm", config }),
      openSnapshot: (config) => dispatch({ type: "openSnapshot", config }),
      openClone: (config) => dispatch({ type: "openClone", config }),
      openRenameVm: (config) => dispatch({ type: "openRenameVm", config }),
      openEditVmHardware: (config) =>
        dispatch({ type: "openEditVmHardware", config }),
      openPermissions: (config) =>
        dispatch({ type: "openPermissions", config }),
    }),
    []
  )

  return (
    <InventoryDialogsContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {state.confirm && (
          <ConfirmDialog
            config={state.confirm}
            onClose={() => dispatch({ type: "closeConfirm" })}
          />
        )}
        {state.createFolder && (
          <RenameDialog
            mode="create-folder"
            open={true}
            parentId={state.createFolder.parentId}
            onOpenChange={(open) => {
              if (!open) dispatch({ type: "closeCreateFolder" })
            }}
          />
        )}
        {state.renameFolder && (
          <RenameDialog
            mode="rename-folder"
            currentName={state.renameFolder.currentName}
            currentDescription={state.renameFolder.currentDescription}
            folderId={state.renameFolder.folderId}
            open={true}
            onOpenChange={(open) => {
              if (!open) dispatch({ type: "closeRenameFolder" })
            }}
          />
        )}
        {state.folderLimit && (
          <FolderLimitDialog
            directVmLimit={state.folderLimit.directVmLimit}
            effectiveVmLimit={state.folderLimit.effectiveVmLimit}
            folderId={state.folderLimit.folderId}
            folderName={state.folderLimit.folderName}
            open={true}
            onOpenChange={(open) => {
              if (!open) dispatch({ type: "closeFolderLimit" })
            }}
          />
        )}
        {state.createVm && (
          <CreateVmDialog
            open={true}
            onOpenChange={(open) => {
              if (!open) dispatch({ type: "closeCreateVm" })
            }}
            initialFolderId={state.createVm.initialFolderId}
          />
        )}
        {state.snapshot && (
          <SnapshotDialog
            itemId={state.snapshot.itemId}
            vmid={state.snapshot.currentVmid}
            vmName={state.snapshot.currentName}
            guestType={state.snapshot.guestType}
            mode={state.snapshot.mode}
            open={true}
            onOpenChange={(open) => {
              if (!open) dispatch({ type: "closeSnapshot" })
            }}
          />
        )}
        {state.clone && (
          <CloneDialog
            itemId={state.clone.itemId}
            currentName={state.clone.currentName}
            currentVmid={state.clone.currentVmid}
            isTemplate={state.clone.isTemplate}
            open={true}
            onOpenChange={(open) => {
              if (!open) dispatch({ type: "closeClone" })
            }}
          />
        )}
        {state.renameVm && (
          <RenameDialog
            mode="rename-item"
            itemId={state.renameVm.itemId}
            currentName={state.renameVm.currentName}
            currentVmid={state.renameVm.currentVmid}
            open={true}
            onOpenChange={(open) => {
              if (!open) dispatch({ type: "closeRenameVm" })
            }}
          />
        )}
        {state.editVmHardware && (
          <VmHardwareDialog
            key={state.editVmHardware.itemId}
            itemId={state.editVmHardware.itemId}
            vmName={state.editVmHardware.currentName}
            vmid={state.editVmHardware.currentVmid}
            open={true}
            onOpenChange={(open) => {
              if (!open) dispatch({ type: "closeEditVmHardware" })
            }}
          />
        )}
        {state.permissions && (
          <InventoryPermissionsDialog
            itemId={state.permissions.itemId}
            itemKind={state.permissions.itemKind}
            itemName={state.permissions.itemName}
            itemVmid={state.permissions.itemVmid}
            open={true}
            onOpenChange={(open) => {
              if (!open) dispatch({ type: "closePermissions" })
            }}
          />
        )}
      </Suspense>
    </InventoryDialogsContext.Provider>
  )
}
