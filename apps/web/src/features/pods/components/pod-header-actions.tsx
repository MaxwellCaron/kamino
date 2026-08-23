import { Fragment, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { HugeiconsIcon } from "@hugeicons/react"
import { ChevronDownIcon } from "@hugeicons/core-free-icons"
import type { ClonedPod } from "@/features/pods/types/pod-types"
import type { PodCloneAction } from "@/features/pods/utils/pod-clone-actions"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { showSingleMutationToast, showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"
import {
  deleteClonedPod,
  powerClonedPod,
} from "@/features/pods/api/clone-pod-api"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"
import {
  POD_CLONE_ACTION_CONFIG,
  POD_CLONE_OVERFLOW_ACTIONS,
  POD_CLONE_POWER_ACTIONS_BY_STATUS,
  podPowerIncompleteMessage,
} from "@/features/pods/utils/pod-clone-actions"

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
  onReclone,
  onClonedPodChange,
}: {
  podTitle: string
  clonedPod: ClonedPod
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
  const visibleActions = POD_CLONE_POWER_ACTIONS_BY_STATUS[clonedPod.status]

  function openAction(action: ConfirmablePodAction) {
    deleteMutation.reset()
    setActiveAction(() => action)
  }

  function handleActionClose() {
    setActiveAction(null)
  }

  function confirmActiveAction() {
    if (!activeAction) return
    const actionConfig = POD_CLONE_ACTION_CONFIG[activeAction]

    const action = activeAction

    if (action === "delete") {
      showUnitMutationToast({
        title: actionConfig.pendingLabel,
        units: [
          {
            items: [{ id: clonedPod.id, name: podTitle, successDescription: "Deleted" }],
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
                disabled={actionPending}
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
                disabled={actionPending}
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
                        actionPending || (action === "reclone" && !onReclone)
                      }
                      onClick={() => {
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

      {confirm && (
        <ConfirmDialog config={confirm} onClose={handleActionClose} />
      )}
    </>
  )
}
