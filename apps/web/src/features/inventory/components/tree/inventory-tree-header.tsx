import { HugeiconsIcon } from "@hugeicons/react"
import { ChevronDownIcon, ChevronUpIcon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import { SidebarGroupLabel } from "@workspace/ui/components/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { Separator } from "@workspace/ui/components/separator"
import { useInventoryTreeContext } from "./inventory-tree-context"
import { InventoryFavoritesSection } from "./favorites-section"

export function InventoryTreeHeader() {
  const { expandAll, collapseAll, isLoading } = useInventoryTreeContext()

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
      <Separator className="my-2" />
      <InventoryFavoritesSection />
      <Separator className="mt-2" />
    </div>
  )
}
