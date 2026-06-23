import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  inventoryItemQueryOptions,
  inventoryTreeQueryOptions,
} from "@/features/inventory/api/inventory-api"
import { InventoryFolderPage } from "@/features/inventory/components/folder/inventory-folder-page"
import { findInventoryTreeNode } from "@/features/inventory/utils/inventory-tree"
import { pageTitle } from "@/features/shared/utils/page-title"
import { VmDashboardPage } from "@/features/vms/components/dashboard/vm-dashboard-page"

export const Route = createFileRoute("/_dashboard/inventory/items/$itemId")({
  loader: async ({ context, params }) => {
    const item = await context.queryClient
      .ensureQueryData(inventoryItemQueryOptions(params.itemId))
      .catch(() => null)

    return {
      title: item?.name ?? null,
      kind: item?.kind ?? null,
    }
  },
  head: ({ loaderData }) => pageTitle(loaderData?.title ?? "Inventory Item"),
  component: RouteComponent,
})

function RouteComponent() {
  const { itemId } = Route.useParams()
  const { kind } = Route.useLoaderData()
  const { data: tree } = useQuery(inventoryTreeQueryOptions)
  const treeKind = tree ? findInventoryTreeNode(tree, itemId)?.kind : undefined

  if ((treeKind ?? kind) === "folder") {
    return <InventoryFolderPage />
  }

  return <VmDashboardPage />
}
