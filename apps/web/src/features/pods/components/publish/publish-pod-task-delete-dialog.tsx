import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"

type PublishPodTaskDeleteDialogProps = {
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  taskTitle: string | null
}

export function PublishPodTaskDeleteDialog({
  onConfirm,
  onOpenChange,
  open,
  taskTitle,
}: PublishPodTaskDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Task?</AlertDialogTitle>
          <AlertDialogDescription>
            {taskTitle
              ? `This will permanently remove "${taskTitle}" and all of its questions.`
              : "This will permanently remove the selected task and all of its questions."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete Task</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
