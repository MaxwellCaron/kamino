import { IconAlertCircle } from "@tabler/icons-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Dialog } from "@workspace/ui/components/dialog"
import type { ApiBulkCreateResponse } from "@/lib/queries"
import {
  AppDialogContent,
  AppDialogScrollBody,
  nestedDialogAnimationClassName,
} from "@/components/dialogs/app-dialog"

export function BulkCreateResultsSummary({
  entityLabel,
  onOpenChange,
  open,
  result,
}: {
  entityLabel: string
  onOpenChange: (open: boolean) => void
  open: boolean
  result: ApiBulkCreateResponse
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={open}
        title={`${entityLabel[0].toUpperCase()}${entityLabel.slice(1)} Creation Results`}
        description={`Successfully created ${result.successful} of ${result.total} ${entityLabel}s.`}
        variant="child"
        showOverlay={false}
        className={nestedDialogAnimationClassName}
      >
        <AppDialogScrollBody>
          {result.failures.map((failure) => (
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>{failure.name}</AlertTitle>
              <AlertDescription>{failure.error}</AlertDescription>
            </Alert>
          ))}
        </AppDialogScrollBody>
      </AppDialogContent>
    </Dialog>
  )
}
