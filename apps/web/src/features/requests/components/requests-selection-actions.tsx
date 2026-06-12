import { IconCheck, IconX } from "@tabler/icons-react"
import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type {
  ApiRequestActionResponse,
  ApiRequestSummary,
} from "@/features/requests/types/request-types"
import type {
  ConfirmConfig,
  ConfirmDialogControls,
  ConfirmStatusItem,
} from "@/components/dialogs/confirm-dialog"
import type { UseMutationResult } from "@tanstack/react-query"
import { findTreePath } from "@/features/inventory/utils/inventory-tree"
import {
  formatRequestKind,
  formatRequestPowerAction,
  getRequestIcon,
} from "@/features/requests/utils/request-presenters"
import { formatVmReference } from "@/features/shared/utils/format"

type RequestsSelectionActionsProps = {
  selectedRows: Array<ApiRequestSummary>
  clearSelection: () => void
  tree: Array<ApiTreeNode> | undefined
  approveMutation: UseMutationResult<
    ApiRequestActionResponse,
    Error,
    Array<string>,
    unknown
  >
  denyMutation: UseMutationResult<
    ApiRequestActionResponse,
    Error,
    Array<string>,
    unknown
  >
  onOpenConfirm: (config: ConfirmConfig) => void
}

export function RequestsSelectionActions({
  selectedRows,
  clearSelection,
  tree,
  approveMutation,
  denyMutation,
  onOpenConfirm,
}: RequestsSelectionActionsProps) {
  const handleBulkAction = (action: "approve" | "deny") => {
    const isApprove = action === "approve"
    const mutation = isApprove ? approveMutation : denyMutation
    const title = isApprove ? "Approve Requests" : "Deny Requests"
    const icon = isApprove ? IconCheck : IconX
    const actionLabel = isApprove ? "Approve" : "Deny"
    const variant = isApprove ? "default" : ("destructive" as const)

    onOpenConfirm({
      title,
      icon,
      actionLabel,
      variant,
      closeOnSuccess: !isApprove,
      description: `Are you sure you want to ${action} ${selectedRows.length} requests?`,
      statusItems: isApprove
        ? selectedRows.map((r) => {
            const powerAction = formatRequestPowerAction(
              r.inventory?.power_action
            )
            const Icon = getRequestIcon(r.kind, r.inventory?.power_action)
            const inventoryTree = tree ?? []
            const path = r.inventory?.item_id
              ? findTreePath(inventoryTree, r.inventory.item_id)
              : null

            const pathLabel = path
              ? path
                  .slice(1, -1)
                  .map((n: ApiTreeNode) => n.name)
                  .join(" / ")
              : null

            return {
              id: r.id,
              kind: "vm",
              icon: Icon,
              label: (
                <div className="font-medium">
                  {powerAction ||
                    (r.inventory?.snapshot_name ? (
                      <span>
                        {formatRequestKind(r.kind)}: {r.inventory.snapshot_name}
                      </span>
                    ) : (
                      formatRequestKind(r.kind)
                    ))}
                </div>
              ),
              description: (
                <span className="truncate">
                  {pathLabel}
                  {" / "}
                  {r.inventory?.vmid &&
                    formatVmReference(r.inventory.vmid, r.inventory.item_name)}
                </span>
              ),
              status: "idle",
            }
          })
        : undefined,
      onConfirm: async (controls: ConfirmDialogControls) => {
        if (!isApprove) {
          const ids = selectedRows.map((r) => r.id)
          mutation.mutate(ids)
          clearSelection()
          return
        }

        const items = controls.getStatusItems()

        controls.setStatusItems((prev) =>
          prev.map((i) => ({ ...i, status: "pending" }))
        )

        await Promise.allSettled(
          items.map(async (item: ConfirmStatusItem) => {
            try {
              const result: ApiRequestActionResponse =
                await mutation.mutateAsync([item.id])
              const failed = result.failed.find((f) => f.id === item.id)

              controls.setStatusItems((prev) =>
                prev.map((i) =>
                  i.id === item.id
                    ? {
                        ...i,
                        status: failed
                          ? ("error" as const)
                          : ("success" as const),
                        error: failed?.error,
                      }
                    : i
                )
              )
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Action failed"
              controls.setStatusItems((prev) =>
                prev.map((i) =>
                  i.id === item.id
                    ? { ...i, status: "error", error: message }
                    : i
                )
              )
            }
          })
        )
        clearSelection()
      },
    })
  }

  return (
    <>
      <ActionBarItem
        onSelect={(event) => event.preventDefault()}
        onClick={() => handleBulkAction("approve")}
        aria-label="Approve selected requests"
        tooltip="Approve"
        variant="default"
      >
        <IconCheck />
      </ActionBarItem>
      <ActionBarSeparator />
      <ActionBarItem
        onSelect={(event) => event.preventDefault()}
        onClick={() => handleBulkAction("deny")}
        aria-label="Deny selected requests"
        tooltip="Deny"
        variant="destructive"
      >
        <IconX />
      </ActionBarItem>
    </>
  )
}
