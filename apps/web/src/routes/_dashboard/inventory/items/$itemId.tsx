import { Navigate, createFileRoute, notFound } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import type { AppBreadcrumb } from "@/components/app-shell/site-breadcrumb-data"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { InventoryFolderPage } from "@/features/inventory/components/folder/inventory-folder-page"
import { loadInventoryItemRouteSources } from "@/features/inventory/utils/inventory-item-route-loader"
import { resolveInventoryRouteRecovery } from "@/features/inventory/utils/inventory-route-recovery"
import { findInventoryTreeNode } from "@/features/inventory/utils/inventory-tree"
import { pageTitle } from "@/features/shared/utils/page-title"
import { VmDashboardPage } from "@/features/vms/components/dashboard/vm-dashboard-page"

const inventoryItemIdSchema = z.uuid()

export const Route = createFileRoute("/_dashboard/inventory/items/$itemId")({
  beforeLoad: ({ params }) => {
    if (!inventoryItemIdSchema.safeParse(params.itemId).success) {
      throw notFound()
    }
  },
  loader: async ({ context, params }) => {
    const { item, treePath } = await loadInventoryItemRouteSources(
      context.queryClient,
      params.itemId
    )
    const treeNode = treePath?.at(-1)

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

    const wasInitiallyResolved = !!(treeNode || item)
    const initialAncestorItemIds = treePath
      ? treePath.slice(0, -1).map((node) => node.id)
      : item?.parent_id
        ? [item.parent_id]
        : []

    return {
      title: treeNode?.name ?? item?.name ?? null,
      kind: treeNode?.kind ?? item?.kind ?? null,
      breadcrumbs,
      wasInitiallyResolved,
      initialAncestorItemIds,
    }
  },
  head: ({ loaderData }) => pageTitle(loaderData?.title ?? "Inventory Item"),
  component: RouteComponent,
})

function RouteComponent() {
  const { itemId } = Route.useParams()
  const { kind, wasInitiallyResolved, initialAncestorItemIds } =
    Route.useLoaderData()
  const { data: tree, error } = useQuery(inventoryTreeQueryOptions)
  const treeKind = tree ? findInventoryTreeNode(tree, itemId)?.kind : undefined

  const recoveryTarget = resolveInventoryRouteRecovery({
    tree: error ? undefined : tree,
    itemId,
    wasInitiallyResolved,
    initialAncestorItemIds,
  })

  if (recoveryTarget?.type === "home") {
    return <Navigate to="/" replace />
  }

  if (recoveryTarget?.type === "item") {
    return (
      <Navigate
        to="/inventory/items/$itemId"
        params={{ itemId: recoveryTarget.itemId }}
        replace
      />
    )
  }

  if ((treeKind ?? kind) === "folder") {
    return <InventoryFolderPage />
  }

  return <VmDashboardPage />
}
