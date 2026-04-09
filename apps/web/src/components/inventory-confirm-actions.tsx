import { useRef, useState } from "react"
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
import type { ReactNode } from "react"

export type ConfirmConfig = {
  title: string
  description: ReactNode
  actionLabel: string
  variant?: "default" | "destructive"
  onConfirm: () => Promise<void> | void
}

export function ConfirmDialog({
  config,
  onClose,
}: {
  config: ConfirmConfig | null
  onClose: () => void
}) {
  const lastConfig = useRef<ConfirmConfig | null>(null)
  const [isPending, setIsPending] = useState(false)
  if (config) lastConfig.current = config

  const display = config ?? lastConfig.current

  return (
    <AlertDialog
      open={config !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{display?.title}</AlertDialogTitle>
          <AlertDialogDescription
            render={<div />}
            className="space-y-3 text-sm text-muted-foreground"
          >
            {display?.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} />
          <AlertDialogAction
            variant={display?.variant ?? "default"}
            disabled={isPending}
            onClick={async () => {
              if (!config) return

              setIsPending(true)

              try {
                await config.onConfirm()
                onClose()
              } catch {
                // Error feedback is handled by the caller.
              } finally {
                setIsPending(false)
              }
            }}
          >
            {display?.actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
