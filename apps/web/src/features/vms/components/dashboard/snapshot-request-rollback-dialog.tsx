import { IconHistory } from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import type { UseMutationResult } from "@tanstack/react-query"
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
        icon={IconHistory}
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
          <AlertDialogAction
            disabled={submitRollbackRequest.isPending || snapshotName === null}
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
            {submitRollbackRequest.isPending ? "Submitting..." : "Submit"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AlertDialog>
  )
}
