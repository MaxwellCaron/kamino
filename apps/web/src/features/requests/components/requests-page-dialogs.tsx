import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiRequestDetail } from "@/features/requests/types/request-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { RequestDetailDialog } from "@/features/requests/components/request-detail-dialog"

type RequestsPageDialogsProps = {
  selectedRequestId: string | null
  canReview: boolean
  requestDetailError: Error | null
  isRequestDetailLoading: boolean
  onApprove: () => void
  onDeny: () => void
  onRequestDetailOpenChange: (open: boolean) => void
  requestDetail: ApiRequestDetail | null | undefined
  tree: Array<ApiTreeNode> | undefined
  confirm: ConfirmConfig | null
  onConfirmClose: () => void
}

export function RequestsPageDialogs({
  selectedRequestId,
  canReview,
  requestDetailError,
  isRequestDetailLoading,
  onApprove,
  onDeny,
  onRequestDetailOpenChange,
  requestDetail,
  tree,
  confirm,
  onConfirmClose,
}: RequestsPageDialogsProps) {
  return (
    <>
      {selectedRequestId !== null && (
        <RequestDetailDialog
          canReview={canReview}
          error={requestDetailError}
          isLoading={isRequestDetailLoading}
          onApprove={onApprove}
          onDeny={onDeny}
          onOpenChange={onRequestDetailOpenChange}
          open={true}
          request={requestDetail ?? null}
          tree={tree}
        />
      )}
      {confirm && <ConfirmDialog config={confirm} onClose={onConfirmClose} />}
    </>
  )
}
