import { useRef } from "react"
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

export type ConfirmConfig = {
  title: string
  description: string
  actionLabel: string
  variant?: "default" | "destructive"
  onConfirm: () => void | Promise<unknown>
}

export function ConfirmDialog({
  config,
  onClose,
}: {
  config: ConfirmConfig | null
  onClose: () => void
}) {
  const lastConfig = useRef<ConfirmConfig | null>(null)
  if (config) lastConfig.current = config

  const display = config ?? lastConfig.current

  return (
    <AlertDialog
      open={config !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{display?.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {display?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            variant={display?.variant ?? "default"}
            onClick={async () => {
              await config?.onConfirm()
              onClose()
            }}
          >
            {display?.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
