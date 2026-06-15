import {
  IconPlayerPlay,
  IconPower,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react"
import type { ComponentType } from "react"
import type { ClonedPodStatus } from "@/features/pods/types/pod-types"

export type PodCloneAction = "start" | "shutdown" | "reclone" | "delete"
export type PodClonePowerAction = Extract<PodCloneAction, "start" | "shutdown">

type PodCloneActionIcon = ComponentType<{ className?: string }>

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
    icon: IconPlayerPlay,
    label: "Start",
    pendingLabel: "Starting",
    menuDescription: "Power on all virtual machines.",
    variant: "default",
  },
  shutdown: {
    icon: IconPower,
    label: "Shutdown",
    pendingLabel: "Shutting down",
    menuDescription: "Safely power off all virtual machines.",
    variant: "destructive",
  },
  reclone: {
    icon: IconRefresh,
    label: "Re-clone",
    pendingLabel: "Re-cloning",
    menuDescription: "Recreate virtual machines.",
    variant: "destructive",
  },
  delete: {
    icon: IconTrash,
    label: "Delete",
    pendingLabel: "Deleting",
    menuDescription: "Delete cloned virtual machines.",
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
