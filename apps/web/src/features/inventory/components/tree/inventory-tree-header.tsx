import { IconChevronDown, IconChevronUp } from "@tabler/icons-react"
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
      <div className="flex items-center justify-between pt-2">
        <SidebarGroupLabel className="text-xl font-semibold tracking-tight text-foreground">
          Inventory
        </SidebarGroupLabel>
        <div className="flex">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={expandAll}
                  disabled={isLoading}
                >
                  <IconChevronDown className="size-3.5" />
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
                  size="icon-sm"
                  variant="ghost"
                  onClick={collapseAll}
                  disabled={isLoading}
                >
                  <IconChevronUp className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent>
              <p>Collapse all</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Separator className="my-3" />
      <InventoryFavoritesSection />
      <Separator className="mt-3" />
    </div>
  )
}
