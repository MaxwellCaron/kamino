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
import { InventorySelectionTemplateDeleteActions } from "./inventory-selection-template-delete-actions"
import { useInventorySelectionActions } from "./use-inventory-selection-actions"

export function InventorySelectionActionBar() {
  const {
    canDelete,
    canPower,
    canTemplate,
    clearSelection,
    createPowerConfirmStatusItems,
    createTemplateConfirmStatusItems,
    deleteStatusItems,
    getStatus,
    open,
    openConfirm,
    powerSelectionLabel,
    powerVmItems,
    runDeleteAction,
    runPowerAction,
    runTemplateAction,
    selectedItems,
    selectedVmItems,
    templateSelectionLabel,
  } = useInventorySelectionActions()

  if (!(open && (canDelete || canPower || canTemplate))) {
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
            canTemplate={canTemplate}
            canDelete={canDelete}
            powerSelectionLabel={powerSelectionLabel}
            powerVmItems={powerVmItems}
            getStatus={getStatus}
            openConfirm={openConfirm}
            createPowerConfirmStatusItems={createPowerConfirmStatusItems}
            runPowerAction={runPowerAction}
          />
        )}
        <InventorySelectionTemplateDeleteActions
          canTemplate={canTemplate}
          canDelete={canDelete}
          templateSelectionLabel={templateSelectionLabel}
          selectedVmItems={selectedVmItems}
          deleteStatusItems={deleteStatusItems}
          getStatus={getStatus}
          openConfirm={openConfirm}
          createTemplateConfirmStatusItems={createTemplateConfirmStatusItems}
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
