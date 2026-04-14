import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  IconCamera,
  IconCopy,
  IconDots,
  IconEdit,
  IconFolder,
  IconFolderPlus,
  IconLock,
  IconPin,
  IconPlayerPlay,
  IconPlayerStop,
  IconPower,
  IconRefresh,
  IconServer,
  IconServerSpark,
  IconTemplate,
  IconTrash,
} from "@tabler/icons-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { toast } from "sonner"
import { useSidebar } from "@workspace/ui/components/sidebar"
import { useTree, useTreeNode } from "@workspace/ui/components/tree"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { InventoryPermissionsDialog } from "./permissions/permissions-dialog"
import { ConfirmDialog } from "./inventory-confirm-actions"
import { RenameDialog } from "./rename-dialog"
import { FolderDialog } from "./folder-dialog"
import type { ConfirmConfig } from "./inventory-confirm-actions"
import type { ApiTreeNode, ApiTreeNodePermissions } from "@/lib/queries"
import {
  InventoryPermissionBits,
  findTreeNode,
  hasInventoryPermission,
  inventoryTreeQueryOptions,
} from "@/lib/queries"
import { CloneDialog } from "@/components/vm/clone-dialog"
import { CreateVmDialog } from "@/components/vm/create-vm-dialog"
import { SnapshotDialog } from "@/components/vm/snapshot-dialog"
import { summarizeFolderDeletion } from "@/lib/inventory-tree"
import { useDeleteFolder } from "@/hooks/use-inventory-actions"
import {
  useConvertToTemplate,
  useDeleteVM,
  useVmPowerAction,
} from "@/hooks/use-vm-actions"

function formatMutationError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function formatAffectedItems(
  items: Array<string>,
  totalCount: number,
  emptyLabel: string
): string {
  if (totalCount === 0) return emptyLabel
  if (items.length === 0) return pluralize(totalCount, "item")

  const remainingCount = Math.max(totalCount - items.length, 0)
  const listedItems = items.join(", ")

  return remainingCount > 0
    ? `${listedItems}, and ${pluralize(remainingCount, "other item")}`
    : listedItems
}

function formatVmIdentifier(name: string | undefined, vmid: number): string {
  const trimmedName = name?.trim()

  return trimmedName ? `"${trimmedName}" (${vmid})` : `${vmid}`
}

function FolderDeletionDescription({
  folderCount,
  vmCount,
  templateCount,
  folderNames,
  vmNames,
  templateNames,
}: {
  folderName: string
  folderCount: number
  vmCount: number
  templateCount: number
  folderNames: Array<string>
  vmNames: Array<string>
  templateNames: Array<string>
}) {
  return (
    <>
      <p>The following items will be permanently deleted.</p>
      <div className="space-y-4 pt-4">
        <Item variant="muted">
          <ItemMedia variant="icon">
            <IconFolder />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-foreground">
              <span>Folders</span>
              <Badge variant={folderCount !== 0 ? "destructive" : "outline"}>
                {folderCount}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {formatAffectedItems(folderNames, folderCount, "—")}
            </ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="muted">
          <ItemMedia variant="icon">
            <IconServer />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-foreground">
              <span>VMs</span>
              <Badge variant={vmCount !== 0 ? "destructive" : "outline"}>
                {vmCount}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {formatAffectedItems(vmNames, vmCount, "—")}
            </ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="muted">
          <ItemMedia variant="icon">
            <IconTemplate />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-foreground">
              <span>Templates</span>
              <Badge variant={templateCount !== 0 ? "destructive" : "outline"}>
                {templateCount}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {formatAffectedItems(templateNames, templateCount, "—")}
            </ItemDescription>
          </ItemContent>
        </Item>
      </div>
    </>
  )
}

function FolderMenuItems({
  permissions,
  onCreateVm,
  onCreateFolder,
  onManagePermissions,
  onRename,
  onDelete,
  isLoading,
}: {
  permissions: ApiTreeNodePermissions
  onCreateVm: () => void
  onCreateFolder: () => void
  onManagePermissions: () => void
  onRename: () => void
  onDelete: () => void
  isLoading?: boolean
}) {
  const canCreateFolder = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.createFolder
  )
  const canCreateVm = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.createVm
  )
  const canRename = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.renameFolder
  )
  const canDelete = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.deleteFolder
  )
  const canManagePermissions = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.managePermissions
  )

  return (
    <>
      {(canCreateFolder || canCreateVm) && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Create</DropdownMenuLabel>
            {canCreateFolder && (
              <DropdownMenuItem onClick={onCreateFolder} disabled={isLoading}>
                <IconFolderPlus className="text-muted-foreground" />
                New Folder
              </DropdownMenuItem>
            )}
            {canCreateVm && (
              <DropdownMenuItem onClick={onCreateVm} disabled={isLoading}>
                <IconServerSpark className="text-muted-foreground" />
                New VM
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {(canRename || canManagePermissions || canDelete) && (
            <DropdownMenuSeparator />
          )}
        </>
      )}
      {(canRename || canManagePermissions) && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem disabled={isLoading}>
              <IconPin className="text-muted-foreground" />
              Pin
            </DropdownMenuItem>
            {canRename && (
              <DropdownMenuItem onClick={onRename} disabled={isLoading}>
                <IconEdit className="text-muted-foreground" />
                Rename
              </DropdownMenuItem>
            )}
            {canManagePermissions && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <IconLock className="text-muted-foreground" />
                Permissions
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {canDelete && <DropdownMenuSeparator />}
        </>
      )}
      {canDelete && (
        <DropdownMenuItem
          variant="destructive"
          onClick={onDelete}
          disabled={isLoading}
        >
          <IconTrash />
          Delete
        </DropdownMenuItem>
      )}
    </>
  )
}

function VmMenuItems({
  permissions,
  node,
  vmid,
  name,
  onAction,
  onManagePermissions,
  onSnapshot,
  onClone,
  onRename,
  isLoading,
}: {
  permissions: ApiTreeNodePermissions
  node: string
  vmid: number
  name?: string
  onAction: (config: ConfirmConfig) => void
  onManagePermissions: () => void
  onSnapshot: () => void
  onClone: () => void
  onRename: () => void
  isLoading?: boolean
}) {
  const powerAction = useVmPowerAction()
  const deleteVm = useDeleteVM()
  const toTemplate = useConvertToTemplate()
  const vmIdentifier = formatVmIdentifier(name, vmid)
  const canPower = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.powerVm
  )
  const canClone = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.cloneVm
  )
  const canTemplate = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.templateVm
  )
  const canSnapshot = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.snapshotVm
  )
  const canRename = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.renameVm
  )
  const canDelete = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.deleteVm
  )
  const canManagePermissions = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.managePermissions
  )

  return (
    <>
      {canPower && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Power</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title: "Start VM?",
                  description: "This will power on the virtual machine.",
                  actionLabel: "Start",
                  variant: "default",
                  onConfirm: () => {
                    toast.promise(
                      powerAction.mutateAsync({ node, vmid, action: "start" }),
                      {
                        loading: `Starting VM ${vmIdentifier}…`,
                        success: `VM ${vmIdentifier} started`,
                        error: (err: Error) => err.message,
                      }
                    )
                  },
                })
              }
            >
              <IconPlayerPlay className="text-muted-foreground" />
              Start
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title: "Shutdown VM?",
                  description:
                    "This will send a shutdown signal to the virtual machine. The guest OS will attempt a graceful shutdown.",
                  actionLabel: "Shutdown",
                  variant: "destructive",
                  onConfirm: () => {
                    toast.promise(
                      powerAction.mutateAsync({
                        node,
                        vmid,
                        action: "shutdown",
                      }),
                      {
                        loading: `Shutting down VM ${vmIdentifier}…`,
                        success: `VM ${vmIdentifier} shut down`,
                        error: (err: Error) => err.message,
                      }
                    )
                  },
                })
              }
            >
              <IconPower className="text-muted-foreground" />
              Shutdown
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title: "Reboot VM?",
                  description:
                    "This will send a reboot signal to the virtual machine.",
                  actionLabel: "Reboot",
                  variant: "destructive",
                  onConfirm: () => {
                    toast.promise(
                      powerAction.mutateAsync({ node, vmid, action: "reboot" }),
                      {
                        loading: `Rebooting VM ${vmIdentifier}…`,
                        success: `VM ${vmIdentifier} rebooted`,
                        error: (err: Error) => err.message,
                      }
                    )
                  },
                })
              }
            >
              <IconRefresh className="text-muted-foreground" />
              Reboot
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isLoading}
              onClick={() =>
                onAction({
                  title: "Stop VM?",
                  description:
                    "This will immediately stop the virtual machine. Unsaved data may be lost.",
                  actionLabel: "Stop",
                  variant: "destructive",
                  onConfirm: () => {
                    toast.promise(
                      powerAction.mutateAsync({ node, vmid, action: "stop" }),
                      {
                        loading: `Stopping VM ${vmIdentifier}…`,
                        success: `VM ${vmIdentifier} stopped`,
                        error: (err: Error) => err.message,
                      }
                    )
                  },
                })
              }
            >
              <IconPlayerStop className="text-muted-foreground" />
              Stop
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {(canClone ||
            canTemplate ||
            canSnapshot ||
            canRename ||
            canManagePermissions ||
            canDelete) && <DropdownMenuSeparator />}
        </>
      )}
      {(canClone ||
        canTemplate ||
        canSnapshot ||
        canRename ||
        canManagePermissions) && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {canClone && (
              <DropdownMenuItem onClick={onClone} disabled={isLoading}>
                <IconCopy className="text-muted-foreground" />
                Clone
              </DropdownMenuItem>
            )}
            {canTemplate && (
              <DropdownMenuItem
                disabled={isLoading}
                onClick={() =>
                  onAction({
                    title: "Convert to Template?",
                    description:
                      "This will convert the VM to a template, making it available for cloning.",
                    actionLabel: "Convert",
                    variant: "destructive",
                    onConfirm: () => {
                      toast.promise(toTemplate.mutateAsync({ node, vmid }), {
                        loading: `Converting VM ${vmIdentifier} to template…`,
                        success: `VM ${vmIdentifier} is now a template`,
                        error: (err: Error) => err.message,
                      })
                    },
                  })
                }
              >
                <IconTemplate className="text-muted-foreground" />
                Template
              </DropdownMenuItem>
            )}
            {canSnapshot && (
              <DropdownMenuItem onClick={onSnapshot} disabled={isLoading}>
                <IconCamera className="text-muted-foreground" />
                Snapshot
              </DropdownMenuItem>
            )}
            {canRename && (
              <DropdownMenuItem onClick={onRename} disabled={isLoading}>
                <IconEdit className="text-muted-foreground" />
                Rename
              </DropdownMenuItem>
            )}
            {canManagePermissions && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <IconLock className="text-muted-foreground" />
                Permissions
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {canDelete && <DropdownMenuSeparator />}
        </>
      )}
      {canDelete && (
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoading}
          onClick={() =>
            onAction({
              title: "Delete VM?",
              description:
                "This will permanently delete the virtual machine. This action cannot be undone.",
              actionLabel: "Delete",
              variant: "destructive",
              onConfirm: () => {
                toast.promise(deleteVm.mutateAsync({ node, vmid }), {
                  loading: `Deleting VM ${vmIdentifier}…`,
                  success: `VM ${vmIdentifier} deleted`,
                  error: (err: Error) => err.message,
                })
              },
            })
          }
        >
          <IconTrash />
          Delete
        </DropdownMenuItem>
      )}
    </>
  )
}

function TemplateMenuItems({
  permissions,
  node,
  vmid,
  name,
  onAction,
  onManagePermissions,
  onClone,
  isLoading,
}: {
  permissions: ApiTreeNodePermissions
  node: string
  vmid: number
  name?: string
  onAction: (config: ConfirmConfig) => void
  onManagePermissions: () => void
  onClone: () => void
  isLoading?: boolean
}) {
  const deleteVm = useDeleteVM()
  const vmIdentifier = formatVmIdentifier(name, vmid)
  const canClone = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.cloneVm
  )
  const canDelete = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.deleteVm
  )
  const canManagePermissions = hasInventoryPermission(
    permissions,
    InventoryPermissionBits.managePermissions
  )

  return (
    <>
      {(canClone || canManagePermissions) && (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            {canClone && (
              <DropdownMenuItem onClick={onClone} disabled={isLoading}>
                <IconCopy className="text-muted-foreground" />
                Clone
              </DropdownMenuItem>
            )}
            {canManagePermissions && (
              <DropdownMenuItem
                onClick={onManagePermissions}
                disabled={isLoading}
              >
                <IconLock className="text-muted-foreground" />
                Permissions
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {canDelete && <DropdownMenuSeparator />}
        </>
      )}
      {canDelete && (
        <DropdownMenuItem
          variant="destructive"
          disabled={isLoading}
          onClick={() =>
            onAction({
              title: "Delete Template?",
              description:
                "This will permanently delete the template. This action cannot be undone.",
              actionLabel: "Delete",
              variant: "destructive",
              onConfirm: () => {
                toast.promise(deleteVm.mutateAsync({ node, vmid }), {
                  loading: `Deleting template ${vmIdentifier}…`,
                  success: `Template ${vmIdentifier} deleted`,
                  error: (err: Error) => err.message,
                })
              },
            })
          }
        >
          <IconTrash />
          Delete
        </DropdownMenuItem>
      )}
    </>
  )
}

function MenuItems({
  permissions,
  isFolder,
  isTemplate,
  node,
  vmid,
  name,
  onAction,
  onManagePermissions,
  onSnapshot,
  onClone,
  onRename,
  onCreateVm,
  onCreateFolder,
  onDeleteFolder,
  isLoading,
}: {
  permissions: ApiTreeNodePermissions
  isFolder: boolean
  isTemplate?: boolean
  node: string
  vmid: number
  name?: string
  onAction: (config: ConfirmConfig) => void
  onManagePermissions: () => void
  onSnapshot: () => void
  onClone: () => void
  onRename: () => void
  onCreateVm: () => void
  onCreateFolder: () => void
  onDeleteFolder: () => void
  isLoading?: boolean
}) {
  if (isFolder)
    return (
      <FolderMenuItems
        permissions={permissions}
        onCreateFolder={onCreateFolder}
        onCreateVm={onCreateVm}
        onManagePermissions={onManagePermissions}
        onRename={onRename}
        onDelete={onDeleteFolder}
        isLoading={isLoading}
      />
    )
  if (isTemplate)
    return (
      <TemplateMenuItems
        permissions={permissions}
        node={node}
        vmid={vmid}
        name={name}
        onAction={onAction}
        onManagePermissions={onManagePermissions}
        onClone={onClone}
        isLoading={isLoading}
      />
    )
  return (
    <VmMenuItems
      permissions={permissions}
      node={node}
      vmid={vmid}
      name={name}
      onAction={onAction}
      onManagePermissions={onManagePermissions}
      onSnapshot={onSnapshot}
      onClone={onClone}
      onRename={onRename}
      isLoading={isLoading}
    />
  )
}

export function TreeNodeMenu({
  permissions,
  isFolder,
  isTemplate,
  vmid,
  pveNode,
  name,
}: {
  permissions: ApiTreeNodePermissions
  isFolder: boolean
  isTemplate?: boolean
  vmid?: number
  pveNode?: string
  name?: string
}) {
  const { selectNode } = useTree()
  const { nodeId } = useTreeNode()
  const { isMobile } = useSidebar()
  const queryClient = useQueryClient()
  const deleteFolder = useDeleteFolder()
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [createVmOpen, setCreateVmOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const hasActions =
    (isFolder &&
      (hasInventoryPermission(
        permissions,
        InventoryPermissionBits.createFolder
      ) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.createVm) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.renameFolder
        ) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.deleteFolder
        ) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.managePermissions
        ))) ||
    (!isFolder &&
      (hasInventoryPermission(permissions, InventoryPermissionBits.powerVm) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.cloneVm) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.snapshotVm
        ) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.renameVm) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.deleteVm) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.templateVm
        ) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.managePermissions
        )))

  if (!hasActions) return null

  function handleDeleteFolder() {
    const tree =
      queryClient.getQueryData<Array<ApiTreeNode>>(
        inventoryTreeQueryOptions.queryKey
      ) ?? []
    const folder = findTreeNode(tree, nodeId)

    if (!folder || folder.kind !== "folder") {
      toast.error("Failed to load folder details.")
      return
    }

    const summary = summarizeFolderDeletion(folder)

    setConfirm({
      title: `Delete folder "${folder.name}"?`,
      description: (
        <FolderDeletionDescription
          folderName={folder.name}
          folderCount={summary.folderCount}
          vmCount={summary.vmCount}
          templateCount={summary.templateCount}
          folderNames={summary.folderNames}
          vmNames={summary.vmNames}
          templateNames={summary.templateNames}
        />
      ),
      actionLabel: "Delete",
      variant: "destructive",
      onConfirm: async () => {
        try {
          await deleteFolder.mutateAsync({ id: nodeId })
          toast.success(`Folder "${folder.name}" deleted`)
        } catch (error) {
          toast.error(formatMutationError(error, "Failed to delete folder"))
          throw error
        }
      },
    })
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && selectNode(nodeId)}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 transition-opacity group-hover/row:opacity-100 data-popup-open:opacity-100"
            >
              <IconDots />
            </Button>
          }
        />
        <DropdownMenuContent align={isMobile ? "end" : "start"}>
          <MenuItems
            permissions={permissions}
            isFolder={isFolder}
            isTemplate={isTemplate}
            node={pveNode ?? ""}
            vmid={vmid ?? 0}
            name={name}
            onAction={setConfirm}
            onManagePermissions={() => setPermissionsOpen(true)}
            onSnapshot={() => setSnapshotOpen(true)}
            onClone={() => setCloneOpen(true)}
            onRename={() => setRenameOpen(true)}
            onCreateVm={() => setCreateVmOpen(true)}
            onCreateFolder={() => setCreateFolderOpen(true)}
            onDeleteFolder={handleDeleteFolder}
            isLoading={false}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
      {createVmOpen && (
        <CreateVmDialog
          open={createVmOpen}
          onOpenChange={setCreateVmOpen}
          initialFolderId={nodeId}
        />
      )}
      {isFolder && (
        <>
          <FolderDialog
            mode="create"
            open={createFolderOpen}
            onOpenChange={setCreateFolderOpen}
            parentId={nodeId}
          />
          <FolderDialog
            mode="rename"
            currentName={name ?? ""}
            folderId={nodeId}
            open={renameOpen}
            onOpenChange={setRenameOpen}
          />
        </>
      )}
      {pveNode && vmid !== undefined && (
        <>
          <SnapshotDialog
            node={pveNode}
            vmid={vmid}
            open={snapshotOpen}
            onOpenChange={setSnapshotOpen}
          />
          <CloneDialog
            node={pveNode}
            vmid={vmid}
            currentName={name ?? ""}
            sourceItemId={nodeId}
            open={cloneOpen}
            onOpenChange={setCloneOpen}
          />
          {!isTemplate && !isFolder && (
            <RenameDialog
              node={pveNode}
              vmid={vmid}
              currentName={name ?? ""}
              open={renameOpen}
              onOpenChange={setRenameOpen}
            />
          )}
        </>
      )}
      {permissionsOpen && (
        <InventoryPermissionsDialog
          itemId={nodeId}
          itemKind={isFolder ? "folder" : "vm"}
          itemName={name ?? ""}
          open={permissionsOpen}
          onOpenChange={setPermissionsOpen}
        />
      )}
    </>
  )
}

export function VmOptionsMenu({
  nodeId,
  permissions,
  isFolder = false,
  isTemplate,
  vmid,
  pveNode,
  name,
  isLoading,
}: {
  nodeId: string
  permissions: ApiTreeNodePermissions
  isFolder?: boolean
  isTemplate?: boolean
  vmid?: number
  pveNode?: string
  name?: string
  isLoading?: boolean
}) {
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [createVmOpen, setCreateVmOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const hasActions =
    (isFolder &&
      (hasInventoryPermission(
        permissions,
        InventoryPermissionBits.createFolder
      ) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.createVm) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.renameFolder
        ) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.deleteFolder
        ) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.managePermissions
        ))) ||
    (!isFolder &&
      (hasInventoryPermission(permissions, InventoryPermissionBits.powerVm) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.cloneVm) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.snapshotVm
        ) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.renameVm) ||
        hasInventoryPermission(permissions, InventoryPermissionBits.deleteVm) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.templateVm
        ) ||
        hasInventoryPermission(
          permissions,
          InventoryPermissionBits.managePermissions
        )))

  if (!hasActions) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon">
              <IconDots />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <MenuItems
            permissions={permissions}
            isFolder={isFolder}
            isTemplate={isTemplate}
            node={pveNode ?? ""}
            vmid={vmid ?? 0}
            name={name}
            onAction={setConfirm}
            onManagePermissions={() => setPermissionsOpen(true)}
            onSnapshot={() => setSnapshotOpen(true)}
            onClone={() => setCloneOpen(true)}
            onRename={() => setRenameOpen(true)}
            onCreateVm={() => setCreateVmOpen(true)}
            onCreateFolder={() => setCreateFolderOpen(true)}
            onDeleteFolder={() => {}}
            isLoading={isLoading}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
      {createVmOpen && (
        <CreateVmDialog
          open={createVmOpen}
          onOpenChange={setCreateVmOpen}
          initialFolderId={nodeId}
        />
      )}
      {isFolder && (
        <>
          <FolderDialog
            mode="create"
            open={createFolderOpen}
            onOpenChange={setCreateFolderOpen}
          />
          <FolderDialog
            mode="rename"
            currentName={name ?? ""}
            open={renameOpen}
            onOpenChange={setRenameOpen}
          />
        </>
      )}
      {pveNode && vmid !== undefined && (
        <>
          <SnapshotDialog
            node={pveNode}
            vmid={vmid}
            open={snapshotOpen}
            onOpenChange={setSnapshotOpen}
          />
          <CloneDialog
            node={pveNode}
            vmid={vmid}
            currentName={name ?? ""}
            sourceItemId={nodeId}
            open={cloneOpen}
            onOpenChange={setCloneOpen}
          />
          {!isTemplate && !isFolder && (
            <RenameDialog
              node={pveNode}
              vmid={vmid}
              currentName={name ?? ""}
              open={renameOpen}
              onOpenChange={setRenameOpen}
            />
          )}
        </>
      )}
      {permissionsOpen && (
        <InventoryPermissionsDialog
          itemId={nodeId}
          itemKind={isFolder ? "folder" : "vm"}
          itemName={name ?? ""}
          open={permissionsOpen}
          onOpenChange={setPermissionsOpen}
        />
      )}
    </>
  )
}
