import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete01Icon,
  MoreVerticalIcon,
  PlayIcon,
  ReloadIcon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import type { PublishedPodCloneSummary } from "@/features/pods/types/pod-types"
import type { PublishedPodClonePendingAction } from "./published-pod-clone-action-dialogs"
import {
  POD_CLONE_ACTION_CONFIG,
  canRunPodCloneAction,
} from "@/features/pods/utils/pod-clone-actions"

export function PublishedPodCloneActionsMenu({
  clone,
  isMutating,
  onAction,
}: {
  clone: PublishedPodCloneSummary
  isMutating: boolean
  onAction: (action: PublishedPodClonePendingAction) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for clone owned by ${clone.owner.label}`}
            disabled={isMutating}
          />
        }
      >
        <HugeiconsIcon
          icon={MoreVerticalIcon}
          className="text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={
              !canRunPodCloneAction(clone.status, "start") || isMutating
            }
            onClick={() => onAction({ type: "start", clone })}
          >
            <HugeiconsIcon icon={PlayIcon} className="text-muted-foreground" />
            {POD_CLONE_ACTION_CONFIG.start.label}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              !canRunPodCloneAction(clone.status, "shutdown") || isMutating
            }
            onClick={() => onAction({ type: "shutdown", clone })}
          >
            <HugeiconsIcon
              icon={POD_CLONE_ACTION_CONFIG.shutdown.icon}
              className="text-muted-foreground"
            />
            {POD_CLONE_ACTION_CONFIG.shutdown.label}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={isMutating}
            onClick={() => onAction({ type: "reclone", clone })}
          >
            <HugeiconsIcon icon={ReloadIcon} />
            {POD_CLONE_ACTION_CONFIG.reclone.label}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={isMutating}
            onClick={() => onAction({ type: "delete", clone })}
          >
            <HugeiconsIcon icon={Delete01Icon} />
            {POD_CLONE_ACTION_CONFIG.delete.label}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
