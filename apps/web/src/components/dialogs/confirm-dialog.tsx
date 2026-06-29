import { useRef } from "react"
import { Alert01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import type { ReactNode } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import { AppActionButton } from "@/components/actions/app-action-button"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"

export type ConfirmConfig = {
  title: string
  description: ReactNode
  body?: ReactNode
  actionLabel: string
  icon?: IconSvgElement
  variant?: "default" | "destructive"
  onConfirm: () => Promise<void> | void
}

function ConfirmDialogSession({
  config,
  onClose,
}: {
  config: ConfirmConfig
  onClose: () => void
}) {
  const HeaderIcon =
    config.icon ??
    (config.variant === "destructive" ? Alert01Icon : InformationCircleIcon)

  return (
    <AppAlertDialogContent
      open
      icon={HeaderIcon}
      title={config.title}
      description={config.description}
      descriptionProps={{
        render: <div />,
        className: "space-y-3 text-sm text-muted-foreground",
      }}
    >
      {config.body}
      <AlertDialogFooter>
        <AlertDialogCancel>Close</AlertDialogCancel>
        <AppActionButton
          variant={config.variant ?? "default"}
          onClick={() => {
            onClose()
            Promise.resolve(config.onConfirm()).catch(() => {})
          }}
        >
          {config.actionLabel}
        </AppActionButton>
      </AlertDialogFooter>
    </AppAlertDialogContent>
  )
}

export function ConfirmDialog({
  config,
  onClose,
}: {
  config: ConfirmConfig | null
  onClose: () => void
}) {
  const prevConfigRef = useRef<ConfirmConfig | null>(null)
  const sessionKeyRef = useRef(0)

  if (config !== prevConfigRef.current && config !== null) {
    sessionKeyRef.current += 1
  }
  prevConfigRef.current = config

  return (
    <AlertDialog
      open={config !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {config ? (
        <ConfirmDialogSession
          key={sessionKeyRef.current}
          config={config}
          onClose={onClose}
        />
      ) : null}
    </AlertDialog>
  )
}
