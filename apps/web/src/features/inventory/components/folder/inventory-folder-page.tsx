import { getRouteApi, notFound } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Separator } from "@workspace/ui/components/separator"
import { inventoryTreeQueryOptions } from "../../api/inventory-api"
import { findInventoryTreeNode } from "../../utils/inventory-tree"
import { InventoryNodeMenu } from "../inventory-actions"
import { InventoryFolderContents } from "./inventory-folder-contents"
import { InventoryFolderSkeleton } from "./inventory-folder-skeleton"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { FolderIcon } from "@/components/status/folder-icon"

const folderRouteApi = getRouteApi("/_dashboard/inventory/items/$itemId")

export function InventoryFolderPage() {
  const { itemId } = folderRouteApi.useParams()
  const { data: tree, isLoading, error } = useQuery(inventoryTreeQueryOptions)
  const folder = tree ? findInventoryTreeNode(tree, itemId) : null

  if (isLoading) {
    return <InventoryFolderSkeleton />
  }

  if (error) {
    return (
      <div className="@container/main flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
          <InlineErrorAlert
            error={error}
            fallback="Failed to load folder."
            title="Load Error"
          />
        </div>
      </div>
    )
  }

  if (!folder || folder.kind !== "folder") {
    throw notFound()
  }

  return (
    <div className="@container/main flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 pt-12">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <FolderIcon className="size-8 shrink-0" />
              <h1 className="min-w-0 wrap-break-word font-heading text-4xl font-extrabold tracking-tight text-balance">
                {folder.name}
              </h1>
            </div>
            {folder.description && (
              <p className="text-xl text-muted-foreground">
                {folder.description}
              </p>
            )}
          </div>
          <InventoryNodeMenu
            itemId={folder.id}
            data={folder}
            iconSize="icon"
            contentAlign="end"
          />
        </div>
        <Separator />
        <InventoryFolderContents folder={folder} />
      </div>
    </div>
  )
}
