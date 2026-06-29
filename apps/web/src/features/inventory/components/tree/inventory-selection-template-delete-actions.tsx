import { HugeiconsIcon } from "@hugeicons/react"
import { Copy02Icon, Delete01Icon } from "@hugeicons/core-free-icons"
import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { InventoryDeleteItem } from "@/features/inventory/utils/inventory-delete-items"
import { InventoryDeleteConfirmItems } from "@/features/inventory/components/inventory-delete-confirm-items"

type InventorySelectionTemplateDeleteActionsProps = {
  canTemplate: boolean
  canDelete: boolean
  deleteItems: Array<InventoryDeleteItem>
  templateSelectionLabel: string
  openConfirm: (config: ConfirmConfig) => void
  runTemplateAction: () => void
  runDeleteAction: () => void
}

export function InventorySelectionTemplateDeleteActions({
  canTemplate,
  canDelete,
  deleteItems,
  templateSelectionLabel,
  openConfirm,
  runTemplateAction,
  runDeleteAction,
}: InventorySelectionTemplateDeleteActionsProps) {
  return (
    <>
      {canTemplate && (
        <>
          <ActionBarItem
            onSelect={(event) => event.preventDefault()}
            onClick={() =>
              openConfirm({
                title: "Templatize",
                icon: Copy02Icon,
                description: (
                  <p>
                    This will convert {templateSelectionLabel} to templates.
                    Once converted, they can no longer be edited as VMs.
                  </p>
                ),
                actionLabel: "Templatize",
                variant: "destructive",
                onConfirm: () => runTemplateAction(),
              })
            }
            aria-label="Templatize selected VMs"
            tooltip="Templatize"
          >
            <HugeiconsIcon icon={Copy02Icon} />
          </ActionBarItem>
          {canDelete && <ActionBarSeparator />}
        </>
      )}
      {canDelete && (
        <ActionBarItem
          onSelect={(event) => event.preventDefault()}
          onClick={() =>
            openConfirm({
              title: "Delete",
              icon: Delete01Icon,
              description: null,
              body: <InventoryDeleteConfirmItems items={deleteItems} />,
              actionLabel: "Delete",
              variant: "destructive",
              onConfirm: () => runDeleteAction(),
            })
          }
          aria-label="Delete selected items"
          tooltip="Delete"
          variant="destructive"
        >
          <HugeiconsIcon icon={Delete01Icon} />
        </ActionBarItem>
      )}
    </>
  )
}
