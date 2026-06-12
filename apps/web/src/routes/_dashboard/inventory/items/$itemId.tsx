import { createFileRoute } from "@tanstack/react-router"
import { inventoryItemQueryOptions } from "@/features/inventory/api/inventory-api"
import { pageTitle } from "@/features/shared/utils/page-title"
import { VmDashboardPage } from "@/features/vms/components/dashboard/vm-dashboard-page"

export const Route = createFileRoute("/_dashboard/inventory/items/$itemId")({
  loader: async ({ context, params }) => {
    const item = await context.queryClient
      .ensureQueryData(inventoryItemQueryOptions(params.itemId))
      .catch(() => null)

    return {
      title: item?.name ?? null,
    }
  },
  head: ({ loaderData }) => pageTitle(loaderData?.title ?? "Inventory Item"),
  component: VmDashboardPage,
})
