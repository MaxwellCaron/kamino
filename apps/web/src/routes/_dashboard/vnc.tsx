import { createFileRoute } from "@tanstack/react-router"
import { VncConsole } from "@workspace/ui/components/vnc-console"
import { PROXMOX_CONFIG } from "@workspace/ui/lib/proxmox-config"

function setAuthCookie() {
  document.cookie = [
    `PVEAuthCookie=${encodeURIComponent(PROXMOX_CONFIG.ticket)}`,
    `domain=${PROXMOX_CONFIG.cookieDomain}`,
    `path=/`,
    window.location.protocol === "https:" ? "secure" : "",
    "samesite=none",
    "max-age=86400",
  ]
    .filter(Boolean)
    .join("; ")
}

function buildConsoleUrl() {
  const params = new URLSearchParams({
    console: "kvm",
    vmid: String(PROXMOX_CONFIG.vmid),
    node: PROXMOX_CONFIG.nodeName,
    resize: "scale",
    novnc: "1",
  })
  return `${PROXMOX_CONFIG.nodeUrl}/?${params.toString()}`
}

export const Route = createFileRoute("/_dashboard/vnc")({
  beforeLoad: () => {
    setAuthCookie()
  },
  loader: () => ({
    consoleUrl: buildConsoleUrl(),
    vmid: PROXMOX_CONFIG.vmid,
    nodeName: PROXMOX_CONFIG.nodeName,
  }),
  component: VncPage,
})

function VncPage() {
  const { consoleUrl, vmid, nodeName } = Route.useLoaderData()

  return <VncConsole url={consoleUrl} vmid={vmid} nodeName={nodeName} />
}
