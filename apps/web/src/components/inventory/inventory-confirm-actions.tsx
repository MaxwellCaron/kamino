import { Loader } from "@dot-loaders/react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import type { ComponentType, ReactNode } from "react"
import {
  AppAlertDialogContent,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { VmIcon } from "@/components/inventory/tree/vm-icon"
import { vmStatusQueryOptions } from "@/lib/queries"

export type ConfirmStatusItem = {
  id: string
  kind: "folder" | "vm"
  label: string
  status: "idle" | "pending" | "success" | "error"
  error?: string
  vmid?: number
  vmStatus?: string
  isTemplate?: boolean
  successVmStatus?: string
  successIsTemplate?: boolean
  successDisplay?: "vm" | "deleted"
}

function renderStatusIcon(item: ConfirmStatusItem) {
  if (item.status === "pending") {
    return (
      <Loader
        loader="braille"
        renderer="svg-grid"
        rendererOptions={{ shape: "circle", cellSize: 6, gap: 2 }}
      />
    )
  }

  if (item.kind === "folder") {
    return (
      <IconFolder className="size-4 fill-yellow-600/20 text-yellow-600 dark:fill-yellow-400/20 dark:text-yellow-400" />
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
          <ItemMedia variant="icon">{renderStatusIcon(item)}</ItemMedia>
          <ItemContent>
            <ItemTitle
              className={item.status === "error" ? "text-destructive" : ""}
            >
              {item.label}
            </ItemTitle>
            {item.error && (
              <ItemDescription className="text-xs text-destructive">
                {item.error}
              </ItemDescription>
            )}
          </ItemContent>
        </Item>
      ))}
    </AppDialogScrollBody>
  )
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
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [statusItems, setStatusItems] = useState<Array<ConfirmStatusItem>>([])
  const statusItemsRef = useRef<Array<ConfirmStatusItem>>([])
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)
  if (config) lastConfig.current = config

  const display = config ?? lastConfig.current
  const HeaderIcon =
    display?.icon ??
    (display?.variant === "destructive" ? IconAlertTriangle : IconInfoCircle)
  const hasStatusItems = statusItems.length > 0
  const allActionsSucceeded =
    hasStatusItems && statusItems.every((item) => item.status === "success")

  statusItemsRef.current = statusItems

  useEffect(() => {
    if (!config) return

    setHasSubmitted(false)
    setIsPending(false)
    setStatusItems(config.statusItems ?? [])
  }, [config])

  useEffect(() => {
    if (!vmStatuses) {
      return
    }

    setStatusItems((current) => {
      const next = current.map((item) => {
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

      return next.some((item, index) => item !== current[index])
        ? next
        : current
    })
  }, [vmStatuses])

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
        {hasStatusItems ? <ConfirmStatusList items={statusItems} /> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {hasStatusItems && hasSubmitted ? "Close" : "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={display?.variant ?? "default"}
            disabled={
              isPending ||
              allActionsSucceeded ||
              display?.actionDisabled === true
            }
            onClick={async () => {
              if (!config) return

              setHasSubmitted(true)
              setIsPending(true)

              try {
                await config.onConfirm({
                  getStatusItems: () => statusItemsRef.current,
                  setStatusItems: (updater) => {
                    setStatusItems((prev) =>
                      typeof updater === "function" ? updater(prev) : updater
                    )
                  },
                })

                if (config.closeOnSuccess ?? true) {
                  onClose()
                }
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
