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
import { useSidebar } from "@workspace/ui/components/sidebar"
import { useTree, useTreeNode } from "@workspace/ui/components/tree"
import { Button } from "@workspace/ui/components/button"
import { ConfirmDialog } from "./confirm-action"
import type { ConfirmConfig } from "./confirm-action"

function FolderMenuItems({
  onAction,
}: {
  onAction: (config: ConfirmConfig) => void
}) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        <DropdownMenuItem>
          <IconFolderPlus className="text-muted-foreground" />
          New Folder
        </DropdownMenuItem>
        <DropdownMenuItem>
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
        <DropdownMenuItem>
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
  onAction,
}: {
  onAction: (config: ConfirmConfig) => void
}) {
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
              onConfirm: () => {},
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
              onConfirm: () => {},
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
              onConfirm: () => {},
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
              onConfirm: () => {},
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
        <DropdownMenuItem>
          <IconCopy className="text-muted-foreground" />
          Clone
        </DropdownMenuItem>
        <DropdownMenuItem>
          <IconTemplate className="text-muted-foreground" />
          Template
        </DropdownMenuItem>
        <DropdownMenuItem>
          <IconCamera className="text-muted-foreground" />
          Snapshot
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

function TemplateMenuItems({
  onAction,
}: {
  onAction: (config: ConfirmConfig) => void
}) {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem>
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

function MenuItems({
  isFolder,
  isTemplate,
  onAction,
}: {
  isFolder: boolean
  isTemplate?: boolean
  onAction: (config: ConfirmConfig) => void
}) {
  if (isFolder) return <FolderMenuItems onAction={onAction} />
  if (isTemplate) return <TemplateMenuItems onAction={onAction} />
  return <VmMenuItems onAction={onAction} />
}

export function TreeNodeMenu({
  isFolder,
  isTemplate,
}: {
  isFolder: boolean
  isTemplate?: boolean
}) {
  const { selectNode } = useTree()
  const { nodeId } = useTreeNode()
  const { isMobile } = useSidebar()
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)

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
            onAction={setConfirm}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

export function VmOptionsMenu({
  isFolder = false,
  isTemplate,
}: {
  isFolder?: boolean
  isTemplate?: boolean
}) {
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)

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
            onAction={setConfirm}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}
