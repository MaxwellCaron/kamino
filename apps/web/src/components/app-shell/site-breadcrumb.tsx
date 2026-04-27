import { Fragment, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useParams } from "@tanstack/react-router"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { IconSlash } from "@tabler/icons-react"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { findTreePath } from "@/features/inventory/utils/inventory-tree"

export function SiteBreadcrumb() {
  const { itemId } = useParams({ strict: false })
  const { data: tree } = useQuery(inventoryTreeQueryOptions)

  const path = useMemo(() => {
    if (!itemId || !tree) {
      return []
    }

    return findTreePath(tree, itemId) ?? []
  }, [itemId, tree])

  if (!path.length || path[path.length - 1]?.kind !== "vm") {
    return null
  }

  return (
    <Breadcrumb className="hidden min-w-0 lg:block">
      <BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden whitespace-nowrap">
        {path.map((segment, index) => {
          const isCurrent = index === path.length - 1

          return (
            <Fragment key={segment.id}>
              <BreadcrumbItem className="min-w-0">
                {isCurrent ? (
                  <BreadcrumbPage className="block max-w-48 truncate sm:max-w-64 lg:max-w-80">
                    {segment.name}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbPage className="block max-w-24 truncate text-muted-foreground sm:max-w-32 lg:max-w-40">
                    {segment.name}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {!isCurrent ? (
                <BreadcrumbSeparator>
                  <IconSlash />
                </BreadcrumbSeparator>
              ) : null}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
