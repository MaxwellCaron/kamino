import { IconTemplate, IconTrash } from "@tabler/icons-react"
import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import { InventoryDeletionDescription } from "../inventory-deletion-description"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { FolderDeletionSummary } from "../../utils/inventory-tree"
import type { SelectedVmItem } from "./inventory-selection-action-bar-utils"

type InventorySelectionTemplateDeleteActionsProps = {
  canTemplate: boolean
  canDelete: boolean
  templateSelectionLabel: string
  selectedVmItems: Array<SelectedVmItem>
  deleteSummary: FolderDeletionSummary
  getStatus: (itemId: string) => string | undefined
  openConfirm: (config: ConfirmConfig) => void
  createTemplateConfirmStatusItems: (
    items: Array<SelectedVmItem>,
    getStatus: (itemId: string) => string | undefined
  ) => ConfirmConfig["statusItems"]
  runTemplateAction: ConfirmConfig["onConfirm"]
  runDeleteAction: () => Promise<void>
}

export function InventorySelectionTemplateDeleteActions({
  canTemplate,
  canDelete,
  templateSelectionLabel,
  selectedVmItems,
  deleteSummary,
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
                icon: IconTemplate,
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
            <IconTemplate />
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
              icon: IconTrash,
              description: (
                <InventoryDeletionDescription
                  folderCount={deleteSummary.folderCount}
                  vmCount={deleteSummary.vmCount}
                  templateCount={deleteSummary.templateCount}
                  folderNames={deleteSummary.folderNames}
                  vmNames={deleteSummary.vmNames}
                  templateNames={deleteSummary.templateNames}
                />
              ),
              actionLabel: "Delete",
              variant: "destructive",
              onConfirm: runDeleteAction,
            })
          }
          aria-label="Delete selected items"
          tooltip="Delete"
          variant="destructive"
        >
          <IconTrash />
        </ActionBarItem>
      )}
    </>
  )
}
