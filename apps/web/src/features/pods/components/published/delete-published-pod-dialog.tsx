import { IconTrash } from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"

export function DeletePublishedPodDialog({
  isPending,
  onConfirm,
  onOpenChange,
  pod,
}: {
  isPending: boolean
  onConfirm: (pod: PublishedPodCatalogEntry) => void
  onOpenChange: (open: boolean) => void
  pod: PublishedPodCatalogEntry | null
}) {
  return (
    <AlertDialog open={pod !== null} onOpenChange={onOpenChange}>
      <AppAlertDialogContent
        open={pod !== null}
        icon={IconTrash}
        title="Delete Catalog Entry?"
        description={
          pod
            ? `This deletes "${pod.title}" from the published catalog database only. The Pod Folder, Pod Template Folder, and Proxmox VMs are not deleted.`
            : ""
        }
      >
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isPending}
            onClick={(event) => {
              event.preventDefault()
              if (!pod) return
              onConfirm(pod)
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AlertDialog>
  )
}
