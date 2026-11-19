import { ChevronDownIcon, ChevronUpIcon } from "@hugeicons/core-free-icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  useInventoryTreeDataContext,
  useInventoryTreeViewContext,
} from "@/hooks/inventory/tree/use-inventory-tree-context"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { InventoryFavoritesSection } from "./favorites-section"
import { SearchInputGroup } from "@/components/forms/search-input-group"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarGroupLabel } from "@workspace/ui/components/sidebar"

export function InventoryTreeHeader() {
  const { error, isLoading } = useInventoryTreeDataContext()
  const {
    expandAll,
    collapseAll,
    searchQuery,
    searchResultCount,
    setSearchQuery,
  } = useInventoryTreeViewContext()

  return (
    <div>
      <div className="flex items-center justify-between">
        <SidebarGroupLabel className="text-xl font-semibold tracking-tight text-foreground">
          Inventory
        </SidebarGroupLabel>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Expand all inventory folders"
                  onClick={expandAll}
                  disabled={isLoading}
                >
                  <HugeiconsIcon icon={ChevronDownIcon} />
                </Button>
              }
            />
            <TooltipContent>
              <p>Expand all</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Collapse all inventory folders"
                  onClick={collapseAll}
                  disabled={isLoading}
                >
                  <HugeiconsIcon icon={ChevronUpIcon} />
                </Button>
              }
            />
            <TooltipContent>
              <p>Collapse all</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="mx-2 py-2">
        <SearchInputGroup
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder="Search..."
          aria-label="Search inventory"
          resultCount={!isLoading && !error ? searchResultCount : null}
        />
      </div>
      <Separator className="my-2" />
      <InventoryFavoritesSection />
      <Separator className="mt-2" />
    </div>
  )
}
