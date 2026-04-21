import {
  IconDeviceDesktop,
  IconFolder,
  IconTemplate,
} from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function formatAffectedItems(
  items: Array<string>,
  totalCount: number,
  emptyLabel: string
): string {
  if (totalCount === 0) return emptyLabel
  if (items.length === 0) return pluralize(totalCount, "item")

  const remainingCount = Math.max(totalCount - items.length, 0)
  const listedItems = items.join(", ")

  return remainingCount > 0
    ? `${listedItems}, and ${pluralize(remainingCount, "other item")}`
    : listedItems
}

export function InventoryDeletionDescription({
  folderCount,
  vmCount,
  templateCount,
  folderNames,
  vmNames,
  templateNames,
}: {
  folderCount: number
  vmCount: number
  templateCount: number
  folderNames: Array<string>
  vmNames: Array<string>
  templateNames: Array<string>
}) {
  return (
    <>
      <p>The following items will be permanently deleted.</p>
      <div className="space-y-4 pt-4">
        <Item variant="muted">
          <ItemMedia variant="icon">
            <IconFolder />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-foreground">
              <span>Folders</span>
              <Badge variant={folderCount !== 0 ? "destructive" : "outline"}>
                {folderCount}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {formatAffectedItems(folderNames, folderCount, "—")}
            </ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="muted">
          <ItemMedia variant="icon">
            <IconDeviceDesktop />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-foreground">
              <span>VMs</span>
              <Badge variant={vmCount !== 0 ? "destructive" : "outline"}>
                {vmCount}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {formatAffectedItems(vmNames, vmCount, "—")}
            </ItemDescription>
          </ItemContent>
        </Item>
        <Item variant="muted">
          <ItemMedia variant="icon">
            <IconTemplate />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="text-foreground">
              <span>Templates</span>
              <Badge variant={templateCount !== 0 ? "destructive" : "outline"}>
                {templateCount}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {formatAffectedItems(templateNames, templateCount, "—")}
            </ItemDescription>
          </ItemContent>
        </Item>
      </div>
    </>
  )
}
