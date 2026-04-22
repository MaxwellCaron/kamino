import type {
  ApiRequestScope,
  ApiRequestStatus,
  ApiRequestSummary,
} from "@/lib/queries"

const requestKindLabels: Record<string, string> = {
  "inventory.vm.power": "Power change",
  "inventory.vm.delete": "Delete VM",
  "inventory.vm.snapshot.create": "Create snapshot",
  "inventory.vm.snapshot.rollback": "Rollback snapshot",
}

const requestStatusLabels: Record<ApiRequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  executed: "Executed",
  execution_failed: "Execution failed",
  canceled: "Canceled",
}

const requestTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
})

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
  return scope === "pending" ? "Pending" : "History"
}

export function formatRequestStatus(status: ApiRequestStatus) {
  return requestStatusLabels[status]
}

export function requestStatusVariant(status: ApiRequestStatus) {
  switch (status) {
    case "executed":
      return "default" as const
    case "denied":
    case "execution_failed":
      return "destructive" as const
    case "pending":
      return "secondary" as const
    case "approved":
    case "canceled":
      return "outline" as const
    default:
      return "outline" as const
  }
}

export function formatRequestTimestamp(value?: string | null) {
  if (!value) {
    return "—"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return requestTimestampFormatter.format(date)
}

export function formatRequestPowerAction(action?: string | null) {
  if (!action) {
    return null
  }

  return action === "power_on" ? "Power on" : startCase(action)
}

export function getRequestTargetLabel(
  request: Pick<ApiRequestSummary, "kind" | "inventory">
) {
  return (
    request.inventory?.item_name?.trim() ||
    request.inventory?.snapshot_name?.trim() ||
    formatRequestKind(request.kind)
  )
}

export function getRequestTargetContext(
  request: Pick<ApiRequestSummary, "inventory">
) {
  const parts: Array<string> = []
  const inventory = request.inventory

  if (!inventory) {
    return null
  }

  if (inventory.item_kind === "vm") {
    parts.push(inventory.is_template ? "Template" : "VM")
  } else if (inventory.item_kind) {
    parts.push(startCase(inventory.item_kind))
  }

  if (inventory.vm_node && inventory.vmid) {
    parts.push(`${inventory.vm_node} / VM ${inventory.vmid}`)
  }

  const powerAction = formatRequestPowerAction(inventory.power_action)
  if (powerAction) {
    parts.push(powerAction)
  }

  if (inventory.snapshot_name) {
    parts.push(`Snapshot ${inventory.snapshot_name}`)
  }

  return parts.length > 0 ? parts.join(" • ") : null
}
