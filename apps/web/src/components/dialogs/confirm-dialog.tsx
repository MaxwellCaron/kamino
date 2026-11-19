import { Alert01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import { useLayoutEffect, useRef, useState } from "react"
import { AppActionButton } from "@/components/app-action-button"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import type { ConfirmConfig } from "@/lib/confirm-dialog"

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
  const prevConfigRef = useRef(config)
  const [sessionKey, setSessionKey] = useState(config === null ? 0 : 1)

  useLayoutEffect(() => {
    if (config !== prevConfigRef.current && config !== null) {
      setSessionKey((current) => current + 1)
    }
    prevConfigRef.current = config
  }, [config])

  return (
    <AlertDialog
      open={config !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {config ? (
        <ConfirmDialogSession
          key={sessionKey}
          config={config}
          onClose={onClose}
        />
      ) : null}
    </AlertDialog>
  )
}
