import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function InventorySelectionMigrationAction({
  onMigrate,
  showTrailingSeparator,
}: {
  onMigrate: () => void
  showTrailingSeparator: boolean
}) {
  return (
    <>
      <ActionBarItem
        onSelect={(event) => event.preventDefault()}
        onClick={onMigrate}
        aria-label="Migrate selected VMs"
        tooltip="Migrate"
      >
        <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} />
      </ActionBarItem>
      {showTrailingSeparator && <ActionBarSeparator />}
    </>
  )
}
