import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import {
  ActionBar,
  ActionBarClose,
  ActionBarGroup,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { InventorySelectionPowerActions } from "./inventory-selection-power-actions"
import { InventorySelectionMigrationAction } from "./inventory-selection-migration-action"
import { InventorySelectionTemplateDeleteActions } from "./inventory-selection-template-delete-actions"
import { useInventorySelectionActions } from "./use-inventory-selection-actions"

export function InventorySelectionActionBar() {
  const {
    canDelete,
    canMigrate,
    canPower,
    canTemplate,
    clearSelection,
    deleteItems,
    open,
    openConfirm,
    powerSelectionLabel,
    runDeleteAction,
    openMigrateAction,
    runPowerAction,
    runTemplateAction,
    selectedItems,
    templateSelectionLabel,
  } = useInventorySelectionActions()

  if (!(open && (canDelete || canMigrate || canPower || canTemplate))) {
    return null
  }

  return (
    <ActionBar
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          clearSelection()
        }
      }}
    >
      <ActionBarSelection>
        {selectedItems.length} <span className="hidden lg:block">selected</span>
      </ActionBarSelection>
      <ActionBarSeparator />
      <ActionBarGroup>
        {canPower && (
          <InventorySelectionPowerActions
            showTrailingSeparator={canMigrate || canTemplate || canDelete}
            powerSelectionLabel={powerSelectionLabel}
            openConfirm={openConfirm}
            runPowerAction={runPowerAction}
          />
        )}
        {canMigrate && (
          <InventorySelectionMigrationAction
            onMigrate={openMigrateAction}
            showTrailingSeparator={canTemplate || canDelete}
          />
        )}
        <InventorySelectionTemplateDeleteActions
          canTemplate={canTemplate}
          canDelete={canDelete}
          deleteItems={deleteItems}
          templateSelectionLabel={templateSelectionLabel}
          openConfirm={openConfirm}
          runTemplateAction={runTemplateAction}
          runDeleteAction={runDeleteAction}
        />
      </ActionBarGroup>
      <ActionBarClose aria-label="Clear selection">
        <HugeiconsIcon icon={Cancel01Icon} />
      </ActionBarClose>
    </ActionBar>
  )
}
