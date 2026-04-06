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

function getMenuItems(isFolder: boolean, isTemplate?: boolean) {
  if (isFolder) return <FolderMenuItems />
  if (isTemplate) return <TemplateMenuItems />
  return <VmMenuItems />
}

function FolderMenuItems() {
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
      <DropdownMenuItem variant="destructive">
        <IconTrash />
        Delete
      </DropdownMenuItem>
    </>
  )
}

function VmMenuItems() {
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel>Power</DropdownMenuLabel>
        <DropdownMenuItem>
          <IconPlayerPlay className="text-muted-foreground" />
          Start
        </DropdownMenuItem>
        <DropdownMenuItem>
          <IconPower className="text-muted-foreground" />
          Shutdown
        </DropdownMenuItem>
        <DropdownMenuItem>
          <IconRefresh className="text-muted-foreground" />
          Reboot
        </DropdownMenuItem>
        <DropdownMenuItem>
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
      <DropdownMenuItem variant="destructive">
        <IconTrash />
        Delete
      </DropdownMenuItem>
    </>
  )
}

function TemplateMenuItems() {
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
      <DropdownMenuItem variant="destructive">
        <IconTrash />
        Delete
      </DropdownMenuItem>
    </>
  )
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

  return (
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
        {getMenuItems(isFolder, isTemplate)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function VmOptionsMenu({
  isFolder = false,
  isTemplate,
}: {
  isFolder?: boolean
  isTemplate?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon">
            <IconDots />
          </Button>
        }
      ></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {getMenuItems(isFolder, isTemplate)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
