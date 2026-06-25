import { IconChevronDown, IconChevronUp } from "@tabler/icons-react"
import { AnimatePresence } from "motion/react"
import { Button } from "@workspace/ui/components/button"
import { SidebarGroupLabel } from "@workspace/ui/components/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { InventoryFavoritesSection } from "./favorites-section"
import { InventoryTreeSearch } from "./tree-search"
import { useInventoryTreeContext } from "./inventory-tree-context"

export function InventoryTreeHeader() {
  const {
    query,
    setQuery,
    resultCount,
    expandAll,
    collapseAll,
    isLoading,
    favoriteIds,
  } = useInventoryTreeContext()

  return (
    <>
      <SidebarGroupLabel className="font-semibold text-foreground">
        Inventory
      </SidebarGroupLabel>
      <div className="absolute top-3 right-3 flex">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={expandAll}
                disabled={isLoading}
              >
                <IconChevronDown />
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
                size="icon-xs"
                variant="ghost"
                onClick={collapseAll}
                disabled={isLoading}
              >
                <IconChevronUp />
              </Button>
            }
          />
          <TooltipContent>
            <p>Collapse all</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <InventoryTreeSearch
        query={query}
        resultCount={resultCount}
        setQuery={setQuery}
      />
      <AnimatePresence initial={false}>
        {favoriteIds.size > 0 && <InventoryFavoritesSection />}
      </AnimatePresence>
    </>
  )
}
