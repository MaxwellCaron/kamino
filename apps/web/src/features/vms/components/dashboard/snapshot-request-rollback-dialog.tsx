import { HistoryIcon } from "@hugeicons/core-free-icons"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import type { UseMutationResult } from "@tanstack/react-query"
import { AppActionButton } from "@/components/actions/app-action-button"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"

type SnapshotRequestRollbackDialogProps = {
  open: boolean
  snapshotName: string | null
  vmReference: string
  itemId: string
  submitRollbackRequest: UseMutationResult<
    unknown,
    Error,
    { itemId: string; snapname: string },
    unknown
  >
  onClose: () => void
  toastSubmitRollbackRequest: (
    promise: Promise<unknown>,
    snapshotName: string
  ) => void
}

export function SnapshotRequestRollbackDialog({
  open,
  snapshotName,
  vmReference,
  itemId,
  submitRollbackRequest,
  onClose,
  toastSubmitRollbackRequest,
}: SnapshotRequestRollbackDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          if (submitRollbackRequest.isPending) {
            return
          }

          onClose()
        }
      }}
    >
      <AppAlertDialogContent
        open={open}
        icon={HistoryIcon}
        title="Rollback"
        description={
          snapshotName ? (
            <>
              Approval required. Rolling back {vmReference} to snapshot{" "}
              <span className="font-medium">{snapshotName}</span> will be added
              to the queue for review.
            </>
          ) : null
        }
      >
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitRollbackRequest.isPending}>
            Cancel
          </AlertDialogCancel>
          <AppActionButton
            type="button"
            disabled={snapshotName === null}
            pending={submitRollbackRequest.isPending}
            pendingLabel="Submitting..."
            onClick={async () => {
              if (snapshotName === null) return

              const promise = submitRollbackRequest.mutateAsync({
                itemId,
                snapname: snapshotName,
              })

              toastSubmitRollbackRequest(promise, snapshotName)

              try {
                await promise
                onClose()
              } catch {
                // Error feedback is handled by the mutation toast.
              }
            }}
          >
            Submit
          </AppActionButton>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AlertDialog>
  )
}
