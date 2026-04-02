import { createFileRoute } from "@tanstack/react-router"
import { VncConsole } from "@workspace/ui/components/vnc-console"
import { PROXMOX_CONFIG } from "@workspace/ui/lib/proxmox-config"

export const Route = createFileRoute("/_dashboard/vnc")({
  loader: () => ({
    vmid: PROXMOX_CONFIG.vmid,
    nodeName: PROXMOX_CONFIG.nodeName,
  }),
  component: VncPage,
})

function VncPage() {
  const { vmid, nodeName } = Route.useLoaderData()

  return <VncConsole node={nodeName} vmid={vmid} />
}
