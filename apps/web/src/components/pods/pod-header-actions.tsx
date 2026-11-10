import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Fragment, useState } from "react"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  POD_CLONE_ACTION_CONFIG,
  POD_CLONE_OVERFLOW_ACTIONS,
  podPowerIncompleteMessage,
} from "@/lib/pods/pod-clone-action-presenters"
import { deleteClonedPod, powerClonedPod } from "@/lib/pods/clone-pod-api"
import {
  showSingleMutationToast,
  showUnitMutationToast,
} from "@/components/feedback/mutation-progress-toast"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { ChevronDownIcon } from "@hugeicons/core-free-icons"
import type { ClonedPod } from "@/lib/pods/pod-types"
import type { ConfirmConfig } from "@/lib/confirm-dialog"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { HugeiconsIcon } from "@hugeicons/react"
import { POD_CLONE_POWER_ACTIONS_BY_STATUS } from "@/lib/pods/pod-clone-actions"
import type { PodCloneAction } from "@/lib/pods/pod-clone-actions"
import { podCatalogQueryOptions } from "@/lib/pods/publish-pod-api"
import { vmStatusQueryOptions } from "@/lib/vms/vm-api"

type VisiblePodHeaderAction = "start" | "shutdown"
type ConfirmablePodAction = Exclude<PodCloneAction, "reclone">

const ACTION_BUTTON_VARIANT: Record<
  VisiblePodHeaderAction,
  "default" | "secondary" | "destructive"
> = {
  start: "default",
  shutdown: "destructive",
}

const POD_HEADER_DIALOG_CONFIG: Record<
  ConfirmablePodAction,
  { title: string; description: string }
> = {
  start: {
    title: "Start Pod?",
    description: "This will power on all virtual machines in your cloned pod.",
  },
  shutdown: {
    title: "Shutdown Pod?",
    description:
      "This will send a shutdown signal to all running virtual machines in your cloned pod.",
  },
  delete: {
    title: "Delete Pod?",
    description:
      "This permanently deletes your cloned pod, its virtual machines, and your saved task progress.",
  },
}

export function PodHeaderActions({
  podTitle,
  clonedPod,
  disabled = false,
  onReclone,
  onClonedPodChange,
}: {
  podTitle: string
  clonedPod: ClonedPod
  disabled?: boolean
  onReclone?: () => void
  onClonedPodChange?: (clonedPod: ClonedPod | null) => void
}) {
  const queryClient = useQueryClient()
  const [activeAction, setActiveAction] = useState<ConfirmablePodAction | null>(
    null
  )
  const deleteMutation = useMutation({
    mutationFn: deleteClonedPod,
    onSuccess: async () => {
      onClonedPodChange?.(null)
      await queryClient.invalidateQueries({
        queryKey: podCatalogQueryOptions.queryKey,
      })
      setActiveAction(null)
    },
    onError: () => {
      setActiveAction(null)
    },
  })
  const actionPending = deleteMutation.isPending
  const controlsDisabled = disabled || actionPending
  const visibleActions = POD_CLONE_POWER_ACTIONS_BY_STATUS[clonedPod.status]

  function openAction(action: ConfirmablePodAction) {
    if (disabled) return
    deleteMutation.reset()
    setActiveAction(() => action)
  }

  function handleActionClose() {
    setActiveAction(null)
  }

  function confirmActiveAction() {
    if (disabled || !activeAction) return
    const actionConfig = POD_CLONE_ACTION_CONFIG[activeAction]

    const action = activeAction

    if (action === "delete") {
      showUnitMutationToast({
        title: actionConfig.pendingLabel,
        units: [
          {
            items: [
              {
                id: clonedPod.id,
                name: podTitle,
                successDescription: "Deleted",
              },
            ],
            run: async () => {
              await deleteMutation.mutateAsync({ clonedPodId: clonedPod.id })
            },
          },
        ],
      })
      return
    }

    showSingleMutationToast({
      title: actionConfig.pendingLabel,
      name: podTitle,
      promise: async () => {
        const nextClonedPod = await powerClonedPod({
          clonedPodId: clonedPod.id,
          action,
        })
        onClonedPodChange?.(nextClonedPod)
        await queryClient.invalidateQueries({
          queryKey: podCatalogQueryOptions.queryKey,
        })
        void queryClient.invalidateQueries({
          queryKey: vmStatusQueryOptions.queryKey,
        })
        if (nextClonedPod.power_result?.status !== "succeeded") {
          throw new Error(podPowerIncompleteMessage(action))
        }
      },
    })
  }

  const confirm: ConfirmConfig | null = activeAction
    ? {
        title: POD_HEADER_DIALOG_CONFIG[activeAction].title,
        description: POD_HEADER_DIALOG_CONFIG[activeAction].description,
        actionLabel: POD_CLONE_ACTION_CONFIG[activeAction].label,
        icon: POD_CLONE_ACTION_CONFIG[activeAction].icon,
        variant: POD_CLONE_ACTION_CONFIG[activeAction].variant,
        onConfirm: confirmActiveAction,
      }
    : null

  return (
    <>
      <ButtonGroup aria-label="Pod actions" className="rounded-3xl bg-muted">
        {visibleActions.map((action) => {
          const config = POD_CLONE_ACTION_CONFIG[action]

          return (
            <Fragment key={action}>
              <Button
                variant={ACTION_BUTTON_VARIANT[action]}
                disabled={controlsDisabled}
                onClick={() => openAction(action)}
              >
                <HugeiconsIcon icon={config.icon} data-icon="inline-start" />
                {config.label}
              </Button>
            </Fragment>
          )
        })}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="secondary"
                size="icon"
                aria-label="More pod actions"
                disabled={controlsDisabled}
              >
                <HugeiconsIcon icon={ChevronDownIcon} />
              </Button>
            }
          />
          <DropdownMenuContent className="w-full" align="end">
            <DropdownMenuGroup>
              {POD_CLONE_OVERFLOW_ACTIONS.map((action) => {
                const config = POD_CLONE_ACTION_CONFIG[action]

                return (
                  <Fragment key={action}>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={
                        controlsDisabled || (action === "reclone" && !onReclone)
                      }
                      onClick={() => {
                        if (disabled) return
                        if (action === "reclone") {
                          onReclone?.()
                          return
                        }
                        openAction(action)
                      }}
                    >
                      <Item className="w-full p-1">
                        <ItemMedia variant="icon">
                          <HugeiconsIcon icon={config.icon} />
                        </ItemMedia>
                        <ItemContent className="gap-0">
                          <ItemTitle>{config.label}</ItemTitle>
                          <ItemDescription>
                            {config.menuDescription}
                          </ItemDescription>
                        </ItemContent>
                      </Item>
                    </DropdownMenuItem>
                  </Fragment>
                )
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>

      {confirm && !disabled && (
        <ConfirmDialog config={confirm} onClose={handleActionClose} />
      )}
    </>
  )
}
