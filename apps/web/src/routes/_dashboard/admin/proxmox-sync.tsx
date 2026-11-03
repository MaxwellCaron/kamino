import { ProxmoxSyncPage } from "@/features/proxmox-sync/components/proxmox-sync-page"
import { createFileRoute } from "@tanstack/react-router"
import { pageTitle } from "@/features/shared/utils/page-title"
import { proxmoxSyncPreviewQueryOptions } from "@/features/proxmox-sync/api/proxmox-sync-api"

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
