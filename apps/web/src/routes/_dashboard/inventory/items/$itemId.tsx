import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import type { AppBreadcrumb } from "@/components/app-shell/site-breadcrumb-data"
import {
  inventoryItemQueryOptions,
  inventoryTreeQueryOptions,
} from "@/features/inventory/api/inventory-api"
import { InventoryFolderPage } from "@/features/inventory/components/folder/inventory-folder-page"
import {
  findInventoryTreeNode,
  findTreePath,
} from "@/features/inventory/utils/inventory-tree"
import { pageTitle } from "@/features/shared/utils/page-title"
import { VmDashboardPage } from "@/features/vms/components/dashboard/vm-dashboard-page"

export const Route = createFileRoute("/_dashboard/inventory/items/$itemId")({
  loader: async ({ context, params }) => {
    const [item, tree] = await Promise.all([
      context.queryClient
        .ensureQueryData(inventoryItemQueryOptions(params.itemId))
        .catch(() => null),
      context.queryClient
        .ensureQueryData(inventoryTreeQueryOptions)
        .catch(() => null),
    ])

    const treePath = tree ? findTreePath(tree, params.itemId) : null

    const breadcrumbs: Array<AppBreadcrumb> = treePath
      ? treePath.map((node, index) => ({
          label: node.name,
          link:
            index === treePath.length - 1
              ? undefined
              : {
                  to: "/inventory/items/$itemId" as const,
                  params: { itemId: node.id },
                },
        }))
      : [{ label: item?.name ?? "Inventory Item" }]

    return {
      title: item?.name ?? null,
      kind: item?.kind ?? null,
      breadcrumbs,
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
