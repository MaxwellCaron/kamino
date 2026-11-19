import type { ClonedPodStatus } from "@/lib/pods/pod-types"

export type PodCloneAction = "start" | "shutdown" | "reclone" | "delete"
export type PodClonePowerAction = Extract<PodCloneAction, "start" | "shutdown">

// Browser-side admission for manager clone, delete, and reclone workflows.
// The API operation limiter remains the authoritative Proxmox work limit.
export const MANAGER_POD_WORKFLOW_CONCURRENCY = 5

export const POD_CLONE_ACTIONS = [
  "start",
  "shutdown",
  "reclone",
  "delete",
] as const satisfies ReadonlyArray<PodCloneAction>

export const POD_CLONE_POWER_ACTIONS_BY_STATUS = {
  running: ["shutdown"],
  stopped: ["start"],
  partial: ["start", "shutdown"],
} as const satisfies Record<ClonedPodStatus, ReadonlyArray<PodClonePowerAction>>

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
