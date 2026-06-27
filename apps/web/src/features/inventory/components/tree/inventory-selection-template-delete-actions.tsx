import { HugeiconsIcon } from "@hugeicons/react"
import { Delete01Icon, Layout01Icon } from "@hugeicons/core-free-icons"
import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { SelectedVmItem } from "../../types/inventory-types"

type InventorySelectionTemplateDeleteActionsProps = {
  canTemplate: boolean
  canDelete: boolean
  templateSelectionLabel: string
  selectedVmItems: Array<SelectedVmItem>
  deleteStatusItems: ConfirmConfig["statusItems"]
  getStatus: (itemId: string) => string | undefined
  openConfirm: (config: ConfirmConfig) => void
  createTemplateConfirmStatusItems: (
    items: Array<SelectedVmItem>,
    getStatus: (itemId: string) => string | undefined
  ) => ConfirmConfig["statusItems"]
  runTemplateAction: ConfirmConfig["onConfirm"]
  runDeleteAction: ConfirmConfig["onConfirm"]
}

export function InventorySelectionTemplateDeleteActions({
  canTemplate,
  canDelete,
  templateSelectionLabel,
  selectedVmItems,
  deleteStatusItems,
  getStatus,
  openConfirm,
  createTemplateConfirmStatusItems,
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
                icon: Layout01Icon,
                description: (
                  <p>
                    This will convert {templateSelectionLabel} to templates.
                    Once converted, they can no longer be edited as VMs.
                  </p>
                ),
                actionLabel: "Templatize",
                closeOnSuccess: false,
                statusItems: createTemplateConfirmStatusItems(
                  selectedVmItems,
                  getStatus
                ),
                variant: "destructive",
                onConfirm: runTemplateAction,
              })
            }
            aria-label="Templatize selected VMs"
            tooltip="Templatize"
          >
            <HugeiconsIcon icon={Layout01Icon} />
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
              actionLabel: "Delete",
              pendingLabel: "Deleting...",
              closeOnSuccess: false,
              statusItems: deleteStatusItems,
              variant: "destructive",
              onConfirm: runDeleteAction,
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
