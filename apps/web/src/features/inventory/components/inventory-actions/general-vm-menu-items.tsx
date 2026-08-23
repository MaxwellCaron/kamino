import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ExternalLinkIcon, StarIcon } from "@hugeicons/core-free-icons"
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@workspace/ui/components/dropdown-menu"
import { hasFavoriteAction } from "./inventory-action-utils"

export function GeneralVmMenuItems({
  itemId,
  isFavorite,
  onToggleFavorite,
  disabled,
}: {
  itemId: string
  isFavorite?: boolean
  onToggleFavorite?: () => void
  disabled?: boolean
}) {
  const canToggleFavorite = hasFavoriteAction(onToggleFavorite)

  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>General</DropdownMenuLabel>
      <DropdownMenuItem
        render={
          <Link
            to="/inventory/items/$itemId"
            params={{ itemId }}
            target="_blank"
            rel="noreferrer"
            aria-label="Open inventory item in a new tab"
          />
        }
      >
        <HugeiconsIcon
          icon={ExternalLinkIcon}
          className="text-muted-foreground"
        />
        Open
      </DropdownMenuItem>
      {canToggleFavorite && (
        <DropdownMenuItem onClick={onToggleFavorite} disabled={disabled}>
          <HugeiconsIcon icon={StarIcon} className="text-muted-foreground" />
          {isFavorite ? "Unfavorite" : "Favorite"}
        </DropdownMenuItem>
      )}
    </DropdownMenuGroup>
  )
}
