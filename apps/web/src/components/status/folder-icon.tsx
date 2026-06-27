import {
  Folder02Icon,
  FolderIcon as FolderIconData,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps } from "react"

const FOLDER_ICON_CLASS =
  "size-4 fill-amber-600/20 text-amber-600 dark:fill-amber-400/20 dark:text-amber-400"

export type FolderIconProps = Omit<
  ComponentProps<typeof HugeiconsIcon>,
  "icon"
> & {
  open?: boolean
}

export function FolderIcon({ className, open, ...props }: FolderIconProps) {
  return (
    <HugeiconsIcon
      icon={open ? Folder02Icon : FolderIconData}
      className={cn(FOLDER_ICON_CLASS, className)}
      {...props}
    />
  )
}
