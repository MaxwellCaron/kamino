export function formatMemory(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function formatVmReference(
  vmid?: number | null,
  vmName?: string | null
) {
  const trimmedName = vmName?.trim()
  const hasVmid = vmid != null && vmid > 0

  if (hasVmid && trimmedName) {
    return `VM ${vmid} (${trimmedName})`
  }

  if (hasVmid) {
    return `VM ${vmid}`
  }

  return trimmedName ?? "this VM"
}

export function formatMutationError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
