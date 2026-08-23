import {
  Delete01Icon,
  PlayIcon,
  PowerIcon,
  ReloadIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import type { ClonedPodStatus } from "@/features/pods/types/pod-types"

export type PodCloneAction = "start" | "shutdown" | "reclone" | "delete"
export type PodClonePowerAction = Extract<PodCloneAction, "start" | "shutdown">

type PodCloneActionIcon = IconSvgElement

// Browser-side admission for manager clone, delete, and reclone workflows.
// The API operation limiter remains the authoritative Proxmox work limit.
export const MANAGER_POD_WORKFLOW_CONCURRENCY = 5

export const POD_CLONE_ACTIONS = [
  "start",
  "shutdown",
  "reclone",
  "delete",
] as const satisfies ReadonlyArray<PodCloneAction>

export const POD_CLONE_OVERFLOW_ACTIONS = [
  "reclone",
  "delete",
] as const satisfies ReadonlyArray<PodCloneAction>

export const POD_CLONE_POWER_ACTIONS_BY_STATUS = {
  running: ["shutdown"],
  stopped: ["start"],
  partial: ["start", "shutdown"],
} as const satisfies Record<ClonedPodStatus, ReadonlyArray<PodClonePowerAction>>

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

export function canRunPodCloneAction(
  status: ClonedPodStatus,
  action: PodCloneAction
) {
  if (action === "start" || action === "shutdown") {
    return (
      POD_CLONE_POWER_ACTIONS_BY_STATUS[status] as ReadonlyArray<PodCloneAction>
    ).includes(action)
  }
  return true
}

export function podPowerIncompleteMessage(action: PodClonePowerAction) {
  return action === "start"
    ? "Pod did not fully start."
    : "Pod did not fully shut down."
}
