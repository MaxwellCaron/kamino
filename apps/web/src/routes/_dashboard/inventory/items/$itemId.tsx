import { Navigate, createFileRoute, notFound } from "@tanstack/react-router"
import type { AppBreadcrumb } from "@/lib/app-shell/site-breadcrumb-data"
import { InventoryFolderPage } from "@/components/inventory/folder/inventory-folder-page"
import { VmDashboardPage } from "@/components/vms/dashboard/vm-dashboard-page"
import { findInventoryTreeNode } from "@/lib/inventory/inventory-tree"
import { inventoryTreeQueryOptions } from "@/lib/inventory/inventory-api"
import { loadInventoryItemRouteSources } from "@/lib/inventory/inventory-item-route-loader"
import { pageTitle } from "@/lib/app-shell/page-title"
import { resolveInventoryRouteRecovery } from "@/lib/inventory/inventory-route-recovery"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"

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
