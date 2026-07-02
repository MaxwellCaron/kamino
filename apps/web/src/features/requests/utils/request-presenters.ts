import {
  AlertCircleIcon,
  Camera01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  HistoryIcon,
  PackageAddIcon,
  PlayIcon,
  PowerIcon,
  Refresh03Icon,
  Settings01Icon,
  StopIcon,
  Tick01Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import type {
  ApiRequestScope,
  ApiRequestStatus,
} from "@/features/requests/types/request-types"

const requestKindLabels: Record<string, string> = {
  "inventory.vm.power": "Power change",
  "inventory.vm.snapshot.create": "Create snapshot",
  "inventory.vm.snapshot.rollback": "Rollback snapshot",
  "personal_pod.create": "Personal pod",
}

const requestStatusLabels: Record<ApiRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  executed: "Executed",
  execution_failed: "Execution failed",
}

export const STATUS_ICONS: Record<ApiRequestStatus, IconSvgElement> = {
  pending: Clock01Icon,
  approved: Tick01Icon,
  denied: Cancel01Icon,
  executed: CheckmarkCircle01Icon,
  execution_failed: AlertCircleIcon,
}

const POWER_ICONS: Record<string, IconSvgElement> = {
  power_on: PlayIcon,
  shutdown: PowerIcon,
  reboot: Refresh03Icon,
  stop: StopIcon,
}

const REQUEST_ICONS: Record<string, IconSvgElement> = {
  "inventory.vm.power": PowerIcon,
  "inventory.vm.snapshot.create": Camera01Icon,
  "inventory.vm.snapshot.rollback": HistoryIcon,
  "personal_pod.create": PackageAddIcon,
}

function startCase(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function getRequestIcon(kind: string, powerAction?: string | null) {
  if (kind === "inventory.vm.power" && powerAction) {
    return POWER_ICONS[powerAction] ?? REQUEST_ICONS[kind]
  }
  return REQUEST_ICONS[kind] ?? Settings01Icon
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
      return "bg-emerald-600/10 border-emerald-600 text-emerald-600 dark:bg-emerald-400/10 dark:border-emerald-400/50 dark:text-emerald-400"
    case "denied":
      return "bg-red-600/10 border-red-600 text-red-600 dark:bg-red-400/10 dark:border-red-400/50 dark:text-red-400"
    case "execution_failed":
      return "bg-orange-600/10 border-orange-600 text-orange-600 dark:bg-orange-400/10 dark:border-orange-400/50 dark:text-orange-400"
    case "pending":
      return "bg-amber-600/10 border-amber-600 text-amber-600 dark:bg-amber-400/10 dark:border-amber-400/50 dark:text-amber-400"
    case "approved":
      return "bg-purple-600/10 border-purple-600 text-purple-600 dark:bg-purple-400/10 dark:border-purple-400/50 dark:text-purple-400"
    default:
      return "bg-slate-600/10 border-slate-600 text-slate-600 dark:bg-slate-400/10 dark:border-slate-400/50 dark:text-slate-400"
  }
}

export function formatRequestPowerAction(action?: string | null) {
  if (!action) {
    return null
  }

  return action === "power_on" ? "Power on" : startCase(action)
}
