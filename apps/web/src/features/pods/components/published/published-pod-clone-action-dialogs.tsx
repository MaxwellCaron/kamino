import {
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import type { PublishedPodCloneSummary } from "@/features/pods/types/pod-types"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"

export type PublishedPodClonePendingAction =
  | { type: "start" | "shutdown"; clone: PublishedPodCloneSummary }
  | { type: "reclone"; clone: PublishedPodCloneSummary }
  | { type: "delete"; clone: PublishedPodCloneSummary }
  | null

export function PublishedPodCloneActionDialogs({
  pendingAction,
  isMutating,
  onPowerConfirm,
  onRecloneConfirm,
  onDeleteConfirm,
  onOpenChange,
}: {
  pendingAction: PublishedPodClonePendingAction
  isMutating: boolean
  onPowerConfirm: (clone: PublishedPodCloneSummary, action: "start" | "shutdown") => void
  onRecloneConfirm: (clone: PublishedPodCloneSummary) => void
  onDeleteConfirm: (clone: PublishedPodCloneSummary) => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <AlertDialog
        open={
          pendingAction?.type === "start" || pendingAction?.type === "shutdown"
        }
        onOpenChange={(open) => {
          if (!open && !isMutating) onOpenChange(false)
        }}
      >
        <AppAlertDialogContent
          open={
            pendingAction?.type === "start" ||
            pendingAction?.type === "shutdown"
          }
          icon={
            pendingAction?.type === "start" ? IconPlayerPlay : IconPlayerStop
          }
          title={
            pendingAction?.type === "start"
              ? "Start Clone?"
              : "Shut Down Clone?"
          }
          description={
            pendingAction?.clone
              ? pendingAction.type === "start"
                ? `Start all VMs in the clone owned by ${pendingAction.clone.owner.label}.`
                : `Shut down all VMs in the clone owned by ${pendingAction.clone.owner.label}.`
              : ""
          }
        >
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isMutating}
              onClick={(e) => {
                e.preventDefault()
                if (
                  !pendingAction ||
                  (pendingAction.type !== "start" &&
                    pendingAction.type !== "shutdown")
                )
                  return
                onPowerConfirm(pendingAction.clone, pendingAction.type)
              }}
            >
              {pendingAction?.type === "start" ? "Start" : "Shut Down"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingAction?.type === "reclone"}
        onOpenChange={(open) => {
          if (!open && !isMutating) onOpenChange(false)
        }}
      >
        <AppAlertDialogContent
          open={pendingAction?.type === "reclone"}
          icon={IconRefresh}
          title="Re-clone Clone?"
          description={
            pendingAction?.type === "reclone"
              ? `Delete and recreate the VMs in the clone owned by ${pendingAction.clone.owner.label}. Task progress and question answers stay.`
              : ""
          }
        >
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isMutating}
              onClick={(e) => {
                e.preventDefault()
                if (pendingAction?.type !== "reclone") return
                onRecloneConfirm(pendingAction.clone)
              }}
            >
              Re-clone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingAction?.type === "delete"}
        onOpenChange={(open) => {
          if (!open && !isMutating) onOpenChange(false)
        }}
      >
        <AppAlertDialogContent
          open={pendingAction?.type === "delete"}
          icon={IconTrash}
          title="Delete Clone?"
          description={
            pendingAction?.type === "delete"
              ? `Delete the clone owned by ${pendingAction.clone.owner.label}. This removes the Proxmox VMs and inventory folder.`
              : ""
          }
        >
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isMutating}
              onClick={(e) => {
                e.preventDefault()
                if (pendingAction?.type !== "delete") return
                onDeleteConfirm(pendingAction.clone)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </>
  )
}
