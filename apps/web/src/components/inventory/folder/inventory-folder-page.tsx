import { getRouteApi, notFound } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"
import { FolderIcon } from "@/components/inventory/folder-icon"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { InventoryFolderContents } from "@/components/inventory/folder/inventory-folder-contents"
import { InventoryNodeMenu } from "@/components/inventory/actions/inventory-node-menu"
import { Separator } from "@workspace/ui/components/separator"
import { findInventoryTreeNode } from "@/lib/inventory/inventory-tree"
import { inventoryTreeQueryOptions } from "@/lib/inventory/inventory-api"
import { useQuery } from "@tanstack/react-query"

const folderRouteApi = getRouteApi("/_dashboard/inventory/items/$itemId")

export function InventoryFolderPage() {
  const { itemId } = folderRouteApi.useParams()
  const { data: tree, isLoading, error } = useQuery(inventoryTreeQueryOptions)
  const folder = tree ? findInventoryTreeNode(tree, itemId) : null

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

  if (!isLoading && (!folder || folder.kind !== "folder")) {
    throw notFound()
  }

  return (
    <div className="@container/main relative flex flex-1 flex-col">
      {folder && folder.kind === "folder" && (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 pt-12">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <FolderIcon className="size-8 shrink-0" />
                <h1 className="min-w-0 font-heading text-4xl font-extrabold tracking-tight text-balance wrap-break-word">
                  {folder.name}
                </h1>
                {folder.effective_vm_limit != null && (
                  <Badge variant="secondary">
                    {folder.vm_count ?? 0} / {folder.effective_vm_limit}
                  </Badge>
                )}
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
          {(folder.children?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <InventoryFolderContents folder={folder} />
          )}
        </div>
      )}
    </div>
  )
}
