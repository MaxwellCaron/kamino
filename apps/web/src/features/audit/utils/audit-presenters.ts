import type { ApiActionEvent } from "../api/audit-api"
import { formatVmReference } from "@/features/shared/utils/format"

export function formatAuditStatus(status: string): string {
  if (status === "") return status
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatPodFolderPath(path?: string): string | undefined {
  if (!path) return undefined
  return path
    .split("/")
    .filter(Boolean)
    .join(" / ")
}

export function presentAuditItemIdentity(item: ApiActionEvent): {
  primary: string
  secondary?: string
} {
  const vmSecondary = item.inventory_item_path || item.inventory_item_parent_name

  if (item.inventory_vm_vmid && item.inventory_vm_vmid > 0) {
    return {
      primary: formatVmReference(item.inventory_vm_vmid, item.inventory_item_name),
      secondary: vmSecondary || undefined,
    }
  }

  if (item.inventory_item_name) {
    return {
      primary: item.inventory_item_name,
      secondary: vmSecondary || undefined,
    }
  }

  if (item.pod_title) {
    return {
      primary: item.pod_title,
      secondary: formatPodFolderPath(item.pod_folder_path) || item.pod_slug || undefined,
    }
  }

  if (item.inventory_item_id) {
    return { primary: item.inventory_item_id }
  }

  if (item.pod_id) {
    return { primary: item.pod_id }
  }

  return { primary: "—" }
}

export function getAuditStatusClassName(status: string): string {
  switch (status) {
    case "succeeded":
      return "bg-emerald-400/20 dark:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400"
    case "failed":
      return "bg-destructive/20 text-destructive"
    default:
      return "bg-amber-400/20 dark:bg-amber-600/20 text-amber-600 dark:text-amber-400"
  }
}
