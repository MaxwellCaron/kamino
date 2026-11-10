import {
  Delete01Icon,
  PlayIcon,
  PowerIcon,
  ReloadIcon,
} from "@hugeicons/core-free-icons"
import type {
  PodCloneAction,
  PodClonePowerAction,
} from "@/lib/pods/pod-clone-actions"
import type { IconSvgElement } from "@hugeicons/react"

type PodCloneActionIcon = IconSvgElement

export const POD_CLONE_OVERFLOW_ACTIONS = [
  "reclone",
  "delete",
] as const satisfies ReadonlyArray<PodCloneAction>

export const POD_CLONE_ACTION_CONFIG = {
  start: {
    icon: PlayIcon,
    label: "Start",
    pendingLabel: "Starting",
    menuDescription: "Power on all virtual machines.",
    variant: "default",
  },
  shutdown: {
    icon: PowerIcon,
    label: "Shutdown",
    pendingLabel: "Shutting down",
    menuDescription: "Safely power off all virtual machines.",
    variant: "destructive",
  },
  reclone: {
    icon: ReloadIcon,
    label: "Re-clone",
    pendingLabel: "Re-cloning",
    menuDescription: "Recreate virtual machines.",
    variant: "destructive",
  },
  delete: {
    icon: Delete01Icon,
    label: "Delete",
    pendingLabel: "Deleting",
    menuDescription: "Delete virtual machines and task progress.",
    variant: "destructive",
  },
} satisfies Record<
  PodCloneAction,
  {
    icon: PodCloneActionIcon
    label: string
    pendingLabel: string
    menuDescription: string
    variant: "default" | "destructive"
  }
>

export function podPowerIncompleteMessage(action: PodClonePowerAction) {
  return action === "start"
    ? "Pod did not fully start."
    : "Pod did not fully shut down."
}
