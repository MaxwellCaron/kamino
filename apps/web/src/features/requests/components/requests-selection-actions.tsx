import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Tick01Icon } from "@hugeicons/core-free-icons"
import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import type {
  ApiRequestActionResponse,
  ApiRequestSummary,
} from "@/features/requests/types/request-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { UseMutationResult } from "@tanstack/react-query"
import { showMutationToast } from "@/components/feedback/mutation-progress-toast"
import { formatRequestKind } from "@/features/requests/utils/request-presenters"

type RequestsSelectionActionsProps = {
  selectedRows: Array<ApiRequestSummary>
  clearSelection: () => void
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
  approveMutation,
  denyMutation,
  onOpenConfirm,
}: RequestsSelectionActionsProps) {
  const handleBulkAction = (action: "approve" | "deny") => {
    const isApprove = action === "approve"
    const mutation = isApprove ? approveMutation : denyMutation
    const title = isApprove ? "Approve Requests" : "Deny Requests"
    const icon = isApprove ? Tick01Icon : Cancel01Icon
    const actionLabel = isApprove ? "Approve" : "Deny"
    const variant = isApprove ? "default" : ("destructive" as const)

    onOpenConfirm({
      title,
      icon,
      actionLabel,
      variant,
      description: `Are you sure you want to ${action} ${selectedRows.length} requests?`,
      onConfirm: () => {
        const ids = selectedRows.map((r) => r.id)

        showMutationToast({
          title: `${isApprove ? "Approving" : "Denying"} ${ids.length} request${ids.length === 1 ? "" : "s"}`,
          items: selectedRows.map((r) => ({
            id: r.id,
            name: formatRequestKind(r.kind),
            successDescription: isApprove ? "Approved" : "Denied",
          })),
          runMutation: async () => {
            const results = await Promise.allSettled(
              ids.map((id) => mutation.mutateAsync([id]))
            )
            const succeeded: Array<string> = []
            const failed: Array<{ id: string; error: string }> = []

            results.forEach((result, index) => {
              const id = ids[index]
              if (result.status === "fulfilled") {
                const requestFailure:
                  | ApiRequestActionResponse["failed"][number]
                  | undefined = result.value.failed.find((f) => f.id === id)
                if (requestFailure) {
                  failed.push({ id, error: requestFailure.error })
                } else {
                  succeeded.push(id)
                }
              } else {
                failed.push({
                  id,
                  error:
                    result.reason instanceof Error
                      ? result.reason.message
                      : "Action failed",
                })
              }
            })

            if (failed.length === 0) {
              clearSelection()
            }

            return { succeeded, failed }
          },
        })
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
        <HugeiconsIcon icon={Tick01Icon} />
      </ActionBarItem>
      <ActionBarSeparator />
      <ActionBarItem
        onSelect={(event) => event.preventDefault()}
        onClick={() => handleBulkAction("deny")}
        aria-label="Deny selected requests"
        tooltip="Deny"
        variant="destructive"
      >
        <HugeiconsIcon icon={Cancel01Icon} />
      </ActionBarItem>
    </>
  )
}
