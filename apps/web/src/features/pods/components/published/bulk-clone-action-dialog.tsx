import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import type {
  CloneBulkAction,
  PendingCloneBulkAction,
} from "../../types/published-pods-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
import { AppActionButton } from "@/components/actions/app-action-button"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import { POD_CLONE_ACTION_CONFIG } from "@/features/pods/utils/pod-clone-actions"

const BULK_CLONE_DIALOG_CONFIG: Record<
  PodCloneAction,
  {
    title: string
    description: (pod: PublishedPodCatalogEntry) => string
    variant: "default" | "destructive"
  }
> = {
  start: {
    title: "Start All Clones?",
    description: (pod) => `Start every cloned instance of "${pod.title}".`,
    variant: "default",
  },
  shutdown: {
    title: "Shutdown All Clones?",
    description: (pod) =>
      `Send a shutdown signal to every cloned instance of "${pod.title}".`,
    variant: "destructive",
  },
  reclone: {
    title: "Re-clone All Clones?",
    description: (pod) =>
      `Delete and recreate VMs for every cloned instance of "${pod.title}". Task progress and question answers stay.`,
    variant: "destructive",
  },
  delete: {
    title: "Delete All Clones?",
    description: (pod) =>
      `Permanently delete every cloned instance of "${pod.title}", including their VMs, inventory folders, and saved task progress.`,
    variant: "destructive",
  },
}

export function BulkCloneActionDialog({
  isPending,
  onConfirm,
  onOpenChange,
  pendingAction,
}: {
  isPending: boolean
  onConfirm: (action: CloneBulkAction) => void
  onOpenChange: (open: boolean) => void
  pendingAction: PendingCloneBulkAction
}) {
  if (!pendingAction) return null

  const baseConfig = POD_CLONE_ACTION_CONFIG[pendingAction.action]
  const dialogConfig = BULK_CLONE_DIALOG_CONFIG[pendingAction.action]

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AppAlertDialogContent
        open
        icon={baseConfig.icon}
        title={dialogConfig.title}
        description={dialogConfig.description(pendingAction.pod)}
      >
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AppActionButton
            type="button"
            variant={dialogConfig.variant}
            pending={isPending}
            pendingLabel={`${baseConfig.pendingLabel}...`}
            onClick={(event) => {
              event.preventDefault()
              onConfirm(pendingAction)
            }}
          >
            {baseConfig.label}
          </AppActionButton>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AlertDialog>
  )
}
