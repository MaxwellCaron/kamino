import { createFileRoute } from "@tanstack/react-router"
import { ProxmoxSyncPage } from "@/features/proxmox-sync/components/proxmox-sync-page"
import { pageTitle } from "@/features/shared/utils/page-title"

export const Route = createFileRoute("/_dashboard/admin/proxmox-sync")({
  head: () => pageTitle("Proxmox Sync"),
  component: ProxmoxSyncPage,
})
