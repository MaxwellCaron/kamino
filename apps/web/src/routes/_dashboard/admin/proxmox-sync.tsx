import { createFileRoute } from "@tanstack/react-router"
import { proxmoxSyncPreviewQueryOptions } from "@/features/proxmox-sync/api/proxmox-sync-api"
import { ProxmoxSyncPage } from "@/features/proxmox-sync/components/proxmox-sync-page"
import { pageTitle } from "@/features/shared/utils/page-title"

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
