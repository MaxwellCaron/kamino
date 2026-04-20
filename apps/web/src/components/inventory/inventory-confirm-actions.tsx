import { useRef, useState } from "react"
import { IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import type { ComponentType, ReactNode } from "react"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"

export type ConfirmConfig = {
  title: string
  description: ReactNode
  actionLabel: string
  icon?: ComponentType<{
    className?: string
  }>
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
  const HeaderIcon =
    display?.icon ??
    (display?.variant === "destructive" ? IconAlertTriangle : IconInfoCircle)

  return (
    <AlertDialog
      open={config !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose()
      }}
    >
      <AppAlertDialogContent
        icon={HeaderIcon}
        title={display?.title ?? ""}
        description={display?.description ?? null}
        descriptionProps={{
          render: <div />,
          className: "space-y-3 text-sm text-muted-foreground",
        }}
      >
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
      </AppAlertDialogContent>
    </AlertDialog>
  )
}
