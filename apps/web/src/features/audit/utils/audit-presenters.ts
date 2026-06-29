export function formatAuditStatus(status: string): string {
  if (status === "") return status
  return status.charAt(0).toUpperCase() + status.slice(1)
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
