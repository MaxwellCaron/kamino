import { apiFetch } from "@/features/auth/api/auth-api"
import { throwResponseError } from "@/features/shared/api/api-json"

export async function downloadSpiceConfig(itemId: string): Promise<void> {
  const res = await apiFetch(
    `/api/v1/inventory/items/${itemId}/vm/console/spice-config`,
    { method: "POST" }
  )

  if (!res.ok) {
    await throwResponseError(res, "download SPICE config")
  }

  const blob = await res.blob()
  triggerBlobDownload(blob, "kamino-spice.vv")
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.rel = "noopener"
    anchor.style.display = "none"
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  } finally {
    URL.revokeObjectURL(url)
  }
}
