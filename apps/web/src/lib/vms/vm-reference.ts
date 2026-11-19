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
