import { ProxmoxSyncPage } from "@/components/proxmox-sync/proxmox-sync-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/lib/app-shell/page-title"
import { proxmoxSyncPreviewQueryOptions } from "@/lib/proxmox-sync-api"

export const Route = createFileRoute("/_dashboard/admin/proxmox-sync")({
  staticData: {
    breadcrumb: { label: "Proxmox Sync" },
  },
  loader: async ({ context }) => {
    await Promise.allSettled([
      context.queryClient.ensureQueryData(proxmoxSyncPreviewQueryOptions),
    ])
  },
  head: () => pageTitle("Proxmox Sync"),
  component: ProxmoxSyncPage,
})
