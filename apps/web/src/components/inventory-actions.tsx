import { useState } from "react"
import {
  IconCamera,
  IconCopy,
  IconDots,
  IconEdit,
  IconFolderPlus,
  IconLock,
  IconPin,
  IconPlayerPlay,
  IconPlayerStop,
  IconPower,
  IconRefresh,
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
import { toast } from "sonner"
import { useSidebar } from "@workspace/ui/components/sidebar"
import { useTree, useTreeNode } from "@workspace/ui/components/tree"
import { Button } from "@workspace/ui/components/button"
import { ConfirmDialog } from "./inventory-confirm-actions"
import { SnapshotDialog } from "./snapshot-dialog"
import { RenameDialog } from "./rename-dialog"
import { CloneDialog } from "./clone-dialog"
import { CreateVmDialog } from "./create-vm-dialog"
import { FolderDialog } from "./folder-dialog"
import type { ConfirmConfig } from "./inventory-confirm-actions"
import {
  useConvertToTemplate,
  useDeleteVM,
  useVmPowerAction,
} from "@/hooks/use-vm-actions"

function FolderMenuItems({
  onAction,
  onCreateVm,
  onCreateFolder,
  onRename,
}: {
  onAction: (config: ConfirmConfig) => void
  onCreateVm: () => void
  onCreateFolder: () => void
  onRename: () => void
}) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        <DropdownMenuItem onClick={onCreateFolder}>
          <IconFolderPlus className="text-muted-foreground" />
          New Folder
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCreateVm}>
          <IconServerSpark className="text-muted-foreground" />
          New VM
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem>
          <IconPin className="text-muted-foreground" />
          Pin
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRename}>
          <IconEdit className="text-muted-foreground" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem>
          <IconLock className="text-muted-foreground" />
          Permissions
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onClick={() =>
          onAction({
            title: "Delete Folder?",
            description:
              "This will permanently delete the folder and all its contents. This action cannot be undone.",
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => {},
          })
        }
      >
        <IconTrash />
        Delete
      </DropdownMenuItem>
    </>
  )
}

function VmMenuItems({
  node,
  vmid,
  onAction,
  onSnapshot,
  onClone,
  onRename,
}: {
  node: string
  vmid: number
  onAction: (config: ConfirmConfig) => void
  onSnapshot: () => void
  onClone: () => void
  onRename: () => void
}) {
  const powerAction = useVmPowerAction()
  const deleteVm = useDeleteVM()
  const toTemplate = useConvertToTemplate()

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Power</DropdownMenuLabel>
        <DropdownMenuItem
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
                    loading: `Starting VM ${vmid}…`,
                    success: `VM ${vmid} started`,
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
          onClick={() =>
            onAction({
              title: "Shutdown VM?",
              description:
                "This will send a shutdown signal to the virtual machine. The guest OS will attempt a graceful shutdown.",
              actionLabel: "Shutdown",
              variant: "destructive",
              onConfirm: () => {
                toast.promise(
                  powerAction.mutateAsync({ node, vmid, action: "shutdown" }),
                  {
                    loading: `Shutting down VM ${vmid}…`,
                    success: `VM ${vmid} shut down`,
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
                    loading: `Rebooting VM ${vmid}…`,
                    success: `VM ${vmid} rebooted`,
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
                    loading: `Stopping VM ${vmid}…`,
                    success: `VM ${vmid} stopped`,
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
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={onClone}>
          <IconCopy className="text-muted-foreground" />
          Clone
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            onAction({
              title: "Convert to Template?",
              description:
                "This will convert the VM to a template, making it available for cloning.",
              actionLabel: "Convert",
              variant: "destructive",
              onConfirm: () => {
                toast.promise(toTemplate.mutateAsync({ node, vmid }), {
                  loading: `Converting VM ${vmid} to template…`,
                  success: `VM ${vmid} is now a template`,
                  error: (err: Error) => err.message,
                })
              },
            })
          }
        >
          <IconTemplate className="text-muted-foreground" />
          Template
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSnapshot}>
          <IconCamera className="text-muted-foreground" />
          Snapshot
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRename}>
          <IconEdit className="text-muted-foreground" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem>
          <IconLock className="text-muted-foreground" />
          Permissions
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onClick={() =>
          onAction({
            title: "Delete VM?",
            description:
              "This will permanently delete the virtual machine. This action cannot be undone.",
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => {
              toast.promise(deleteVm.mutateAsync({ node, vmid }), {
                loading: `Deleting VM ${vmid}…`,
                success: `VM ${vmid} deleted`,
                error: (err: Error) => err.message,
              })
            },
          })
        }
      >
        <IconTrash />
        Delete
      </DropdownMenuItem>
    </>
  )
}

function TemplateMenuItems({
  node,
  vmid,
  onAction,
  onClone,
}: {
  node: string
  vmid: number
  onAction: (config: ConfirmConfig) => void
  onClone: () => void
}) {
  const deleteVm = useDeleteVM()

  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={onClone}>
          <IconCopy className="text-muted-foreground" />
          Clone
        </DropdownMenuItem>
        <DropdownMenuItem>
          <IconLock className="text-muted-foreground" />
          Permissions
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        onClick={() =>
          onAction({
            title: "Delete Template?",
            description:
              "This will permanently delete the template. This action cannot be undone.",
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => {
              toast.promise(deleteVm.mutateAsync({ node, vmid }), {
                loading: `Deleting template ${vmid}…`,
                success: `Template ${vmid} deleted`,
                error: (err: Error) => err.message,
              })
            },
          })
        }
      >
        <IconTrash />
        Delete
      </DropdownMenuItem>
    </>
  )
}

function MenuItems({
  isFolder,
  isTemplate,
  node,
  vmid,
  onAction,
  onSnapshot,
  onClone,
  onRename,
  onCreateVm,
  onCreateFolder,
}: {
  isFolder: boolean
  isTemplate?: boolean
  node: string
  vmid: number
  onAction: (config: ConfirmConfig) => void
  onSnapshot: () => void
  onClone: () => void
  onRename: () => void
  onCreateVm: () => void
  onCreateFolder: () => void
}) {
  if (isFolder)
    return (
      <FolderMenuItems
        onAction={onAction}
        onCreateFolder={onCreateFolder}
        onCreateVm={onCreateVm}
        onRename={onRename}
      />
    )
  if (isTemplate)
    return (
      <TemplateMenuItems
        node={node}
        vmid={vmid}
        onAction={onAction}
        onClone={onClone}
      />
    )
  return (
    <VmMenuItems
      node={node}
      vmid={vmid}
      onAction={onAction}
      onSnapshot={onSnapshot}
      onClone={onClone}
      onRename={onRename}
    />
  )
}

export function TreeNodeMenu({
  isFolder,
  isTemplate,
  vmid,
  pveNode,
  name,
}: {
  isFolder: boolean
  isTemplate?: boolean
  vmid?: number
  pveNode?: string
  name?: string
}) {
  const { selectNode } = useTree()
  const { nodeId } = useTreeNode()
  const { isMobile } = useSidebar()
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [createVmOpen, setCreateVmOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)

  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && selectNode(nodeId)}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 transition-opacity group-hover/row:opacity-100 data-popup-open:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <IconDots />
            </Button>
          }
        />
        <DropdownMenuContent align={isMobile ? "end" : "start"}>
          <MenuItems
            isFolder={isFolder}
            isTemplate={isTemplate}
            node={pveNode ?? ""}
            vmid={vmid ?? 0}
            onAction={setConfirm}
            onSnapshot={() => setSnapshotOpen(true)}
            onClone={() => setCloneOpen(true)}
            onRename={() => setRenameOpen(true)}
            onCreateVm={() => setCreateVmOpen(true)}
            onCreateFolder={() => setCreateFolderOpen(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
      {createVmOpen && (
        <CreateVmDialog open={createVmOpen} onOpenChange={setCreateVmOpen} />
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
    </>
  )
}

export function VmOptionsMenu({
  isFolder = false,
  isTemplate,
  vmid,
  pveNode,
  name,
}: {
  isFolder?: boolean
  isTemplate?: boolean
  vmid?: number
  pveNode?: string
  name?: string
}) {
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [createVmOpen, setCreateVmOpen] = useState(false)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)

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
            isFolder={isFolder}
            isTemplate={isTemplate}
            node={pveNode ?? ""}
            vmid={vmid ?? 0}
            onAction={setConfirm}
            onSnapshot={() => setSnapshotOpen(true)}
            onClone={() => setCloneOpen(true)}
            onRename={() => setRenameOpen(true)}
            onCreateVm={() => setCreateVmOpen(true)}
            onCreateFolder={() => setCreateFolderOpen(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
      {createVmOpen && (
        <CreateVmDialog open={createVmOpen} onOpenChange={setCreateVmOpen} />
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
    </>
  )
}
