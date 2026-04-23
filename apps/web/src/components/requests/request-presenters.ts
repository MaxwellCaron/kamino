import {
  IconAlertCircle,
  IconCheck,
  IconCircleCheck,
  IconClock,
  IconX,
} from "@tabler/icons-react"
import type { ApiRequestScope, ApiRequestStatus } from "@/lib/queries"

const requestKindLabels: Record<string, string> = {
  "inventory.vm.power": "Power change",
  "inventory.vm.snapshot.create": "Create snapshot",
  "inventory.vm.snapshot.rollback": "Rollback snapshot",
}

const requestStatusLabels: Record<ApiRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  executed: "Executed",
  execution_failed: "Execution failed",
}

export const STATUS_DESCRIPTIONS: Record<ApiRequestStatus, string> = {
  pending: "Awaiting outcome.",
  approved: "Awaiting execution.",
  denied: "Request rejected.",
  executed: "Task completed.",
  execution_failed: "System error.",
}

export const STATUS_ICONS: Record<ApiRequestStatus, typeof IconClock> = {
  pending: IconClock,
  approved: IconCheck,
  denied: IconX,
  executed: IconCircleCheck,
  execution_failed: IconAlertCircle,
}

function startCase(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function formatRequestKind(kind: string) {
  return requestKindLabels[kind] ?? startCase(kind)
}

export function formatRequestScope(scope: ApiRequestScope) {
  return scope === "pending" ? "Pending" : "Completed"
}

export function formatRequestStatus(status: ApiRequestStatus) {
  return requestStatusLabels[status]
}

export function getRequestStatusClassName(status: ApiRequestStatus) {
  switch (status) {
    case "executed":
      return "bg-green-600/10 border-green-600 text-green-600 dark:bg-green-400/10 dark:border-green-400 dark:text-green-400"
    case "denied":
      return "bg-red-600/10 border-red-600 text-red-600 dark:bg-red-400/10 dark:border-red-400 dark:text-red-400"
    case "execution_failed":
      return "bg-orange-600/10 border-orange-600 text-orange-600 dark:bg-orange-400/10 dark:border-orange-400 dark:text-orange-400"
    case "pending":
      return "bg-yellow-600/10 border-yellow-600 text-yellow-600 dark:bg-yellow-400/10 dark:border-yellow-400 dark:text-yellow-400"
    case "approved":
      return "bg-purple-600/10 border-purple-600 text-purple-600 dark:bg-purple-400/10 dark:border-purple-400 dark:text-purple-400"
    default:
      return "bg-slate-600/10 border-slate-600 text-slate-600 dark:bg-slate-400/10 dark:border-slate-400 dark:text-slate-400"
  }
}

export function formatRequestPowerAction(action?: string | null) {
  if (!action) {
    return null
  }

  return action === "power_on" ? "Power on" : startCase(action)
}
