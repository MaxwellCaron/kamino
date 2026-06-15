import { IconLoader2 } from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import type {
  CloneBulkAction,
  PendingCloneBulkAction,
} from "../../types/published-pods-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
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
          <AlertDialogAction
            variant={dialogConfig.variant}
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault()
              onConfirm(pendingAction)
            }}
          >
            {isPending && (
              <IconLoader2 data-icon="inline-start" className="animate-spin" />
            )}
            {isPending ? `${baseConfig.pendingLabel}...` : baseConfig.label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AlertDialog>
  )
}
