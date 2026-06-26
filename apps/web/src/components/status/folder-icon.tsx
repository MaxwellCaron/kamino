import { IconFolder, IconFolderOpen } from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps } from "react"

const FOLDER_ICON_CLASS =
  "size-4 fill-amber-600/20 text-amber-600 dark:fill-amber-400/20 dark:text-amber-400"

export type FolderIconProps = ComponentProps<typeof IconFolder> & {
  open?: boolean
}

export function FolderIcon({ className, open, ...props }: FolderIconProps) {
  const Icon = open ? IconFolderOpen : IconFolder

  return <Icon className={cn(FOLDER_ICON_CLASS, className)} {...props} />
}
