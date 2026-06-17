import { Loader } from "@dot-loaders/react"
import { useQuery } from "@tanstack/react-query"
import { isValidElement, useMemo, useRef, useState } from "react"
import {
  IconAlertTriangle,
  IconDeviceDesktopX,
  IconFolder,
  IconInfoCircle,
} from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import { cn } from "@workspace/ui/lib/utils"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import type { ComponentType, ReactNode, RefObject } from "react"
import {
  AppAlertDialogContent,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { VmIcon } from "@/components/status/vm-icon"
import { getRequestStatusClassName } from "@/features/requests/utils/request-presenters"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"

export type ConfirmStatusItem = {
  id: string
  kind: "folder" | "vm"
  label: ReactNode
  description?: ReactNode
  icon?: ComponentType<{ className?: string }> | ReactNode
  status: "idle" | "pending" | "success" | "error"
  error?: string
  vmid?: number
  vmStatus?: string
  isTemplate?: boolean
  successVmStatus?: string
  successIsTemplate?: boolean
  successDisplay?: "vm" | "deleted"
}

function ConfirmStatusIcon({ item }: { item: ConfirmStatusItem }) {
  const isPending = item.status === "pending"

  if (item.icon) {
    const Icon = item.icon

    if (isValidElement(Icon)) {
      return Icon
    }

    if (
      typeof Icon === "function" ||
      (typeof Icon === "object" && "render" in Icon)
    ) {
      let statusClasses = "bg-secondary text-secondary-foreground"

      if (item.status === "success") {
        statusClasses = getRequestStatusClassName("executed")
      } else if (item.status === "error") {
        statusClasses = getRequestStatusClassName("denied")
      }

      const IconComponent = Icon as ComponentType<{ className?: string }>

      return (
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
            statusClasses
          )}
        >
          {isPending ? (
            <Loader loader="braille" renderer="svg-grid" />
          ) : (
            <IconComponent className="size-5" />
          )}
        </div>
      )
    }

    return Icon as ReactNode
  }

  if (isPending) {
    return <Loader loader="braille" renderer="svg-grid" />
  }

  if (item.kind === "folder") {
    return (
      <IconFolder className="size-4 fill-amber-600/20 text-amber-600 dark:fill-amber-400/20 dark:text-amber-400" />
    )
  }

  if (item.status === "error") {
    return <IconDeviceDesktopX className="size-4 text-destructive" />
  }

  if (item.status === "success") {
    if (item.successDisplay === "deleted") {
      return <IconDeviceDesktopX className="size-4 text-muted-foreground" />
    }

    return (
      <VmIcon
        status={item.successVmStatus}
        isTemplate={item.successIsTemplate}
      />
    )
  }

  return <VmIcon status={item.vmStatus} isTemplate={item.isTemplate} />
}

export type ConfirmDialogControls = {
  getStatusItems: () => Array<ConfirmStatusItem>
  setStatusItems: (
    updater:
      | Array<ConfirmStatusItem>
      | ((prev: Array<ConfirmStatusItem>) => Array<ConfirmStatusItem>)
  ) => void
}

export type ConfirmConfig = {
  title: string
  description: ReactNode
  actionLabel: string
  actionDisabled?: boolean
  closeOnSuccess?: boolean
  icon?: ComponentType<{
    className?: string
  }>
  statusItems?: Array<ConfirmStatusItem>
  variant?: "default" | "destructive"
  onConfirm: (controls: ConfirmDialogControls) => Promise<void> | void
}

function ConfirmStatusList({ items }: { items: Array<ConfirmStatusItem> }) {
  return (
    <AppDialogScrollBody className="-mb-8 gap-3">
      {items.map((item) => (
        <Item key={item.id} variant="muted">
          <ItemMedia variant="icon">
            <ConfirmStatusIcon item={item} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle
              className={item.status === "error" ? "text-destructive" : ""}
            >
              {item.label}
            </ItemTitle>
            {item.error ? (
              <ItemDescription className="text-xs text-destructive">
                {item.error}
              </ItemDescription>
            ) : (
              item.description && (
                <ItemDescription className="text-xs">
                  {item.description}
                </ItemDescription>
              )
            )}
          </ItemContent>
        </Item>
      ))}
    </AppDialogScrollBody>
  )
}

function ConfirmDialogSession({
  config,
  onClose,
  isPendingRef,
}: {
  config: ConfirmConfig
  onClose: () => void
  isPendingRef: RefObject<boolean>
}) {
  const [isPending, setIsPending] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [statusItems, setStatusItems] = useState<Array<ConfirmStatusItem>>(
    () => config.statusItems ?? []
  )
  const statusItemsRef = useRef<Array<ConfirmStatusItem>>([])
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)

  const HeaderIcon =
    config.icon ??
    (config.variant === "destructive" ? IconAlertTriangle : IconInfoCircle)
  statusItemsRef.current = statusItems
  isPendingRef.current = isPending

  const resolvedStatusItems = useMemo(() => {
    if (!vmStatuses) {
      return statusItems
    }

    return statusItems.map((item) => {
      if (item.kind !== "vm" || item.vmid == null) {
        return item
      }

      const liveStatus = vmStatuses[item.vmid]
      let nextItem = item

      if (liveStatus !== item.vmStatus) {
        nextItem = {
          ...nextItem,
          vmStatus: liveStatus,
        }
      }

      if (
        nextItem.status === "pending" &&
        nextItem.successDisplay !== "deleted" &&
        nextItem.successVmStatus &&
        liveStatus === nextItem.successVmStatus
      ) {
        nextItem = {
          ...nextItem,
          status: "success",
          error: undefined,
        }
      }

      return nextItem
    })
  }, [statusItems, vmStatuses])

  const allActionsSucceeded =
    resolvedStatusItems.length > 0 &&
    resolvedStatusItems.every((item) => item.status === "success")

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
      {resolvedStatusItems.length > 0 && (
        <ConfirmStatusList items={resolvedStatusItems} />
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending}>
          {resolvedStatusItems.length > 0 && hasSubmitted ? "Close" : "Cancel"}
        </AlertDialogCancel>
        <AlertDialogAction
          variant={config.variant ?? "default"}
          disabled={
            isPending || allActionsSucceeded || config.actionDisabled === true
          }
          onClick={async () => {
            setHasSubmitted(true)
            const closeOnSuccess = config.closeOnSuccess ?? true

            if (closeOnSuccess) {
              onClose()
            } else {
              setIsPending(true)
            }

            try {
              await config.onConfirm({
                getStatusItems: () => statusItemsRef.current,
                setStatusItems: (updater) => {
                  setStatusItems((prev) =>
                    typeof updater === "function" ? updater(prev) : updater
                  )
                },
              })
            } catch {
              // Error feedback is handled by the caller.
            } finally {
              if (!closeOnSuccess) {
                setIsPending(false)
              }
            }
          }}
        >
          {config.actionLabel}
        </AlertDialogAction>
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
  const isPendingRef = useRef(false)

  if (config !== prevConfigRef.current && config !== null) {
    sessionKeyRef.current += 1
  }
  prevConfigRef.current = config

  return (
    <AlertDialog
      open={config !== null}
      onOpenChange={(open) => {
        if (!open && !isPendingRef.current) onClose()
      }}
    >
      {config ? (
        <ConfirmDialogSession
          key={sessionKeyRef.current}
          config={config}
          onClose={onClose}
          isPendingRef={isPendingRef}
        />
      ) : null}
    </AlertDialog>
  )
}
