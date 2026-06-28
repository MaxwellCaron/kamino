import { Fragment, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
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
import { AppActionButton } from "@/components/actions/app-action-button"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import {
  deleteClonedPod,
  powerClonedPod,
} from "@/features/pods/api/clone-pod-api"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"
import {
  POD_CLONE_ACTION_CONFIG,
  POD_CLONE_OVERFLOW_ACTIONS,
  POD_CLONE_POWER_ACTIONS_BY_STATUS,
} from "@/features/pods/utils/pod-clone-actions"

type VisiblePodHeaderAction = "start" | "shutdown"

const ACTION_BUTTON_VARIANT: Record<
  VisiblePodHeaderAction,
  "default" | "secondary" | "destructive"
> = {
  start: "default",
  shutdown: "destructive",
}

const POD_HEADER_DIALOG_CONFIG: Record<
  PodCloneAction,
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
  reclone: {
    title: "Re-clone Pod?",
    description:
      "This deletes and recreates your cloned virtual machines while keeping your saved task progress and question answers.",
  },
  delete: {
    title: "Delete Pod?",
    description:
      "This permanently deletes your cloned pod, its virtual machines, and your saved task progress.",
  },
}

export function PodHeaderActions({
  clonedPod,
  onReclone,
  onClonedPodChange,
}: {
  clonedPod: ClonedPod
  onReclone?: () => void
  onClonedPodChange?: (clonedPod: ClonedPod | null) => void
}) {
  const queryClient = useQueryClient()
  const [activeAction, setActiveAction] = useState<PodCloneAction | null>(null)
  const powerMutation = useMutation({
    mutationFn: powerClonedPod,
    onSuccess: async (nextClonedPod) => {
      onClonedPodChange?.(nextClonedPod)
      await queryClient.invalidateQueries({
        queryKey: podCatalogQueryOptions.queryKey,
      })
      setActiveAction(null)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteClonedPod,
    onSuccess: async () => {
      onClonedPodChange?.(null)
      await queryClient.invalidateQueries({
        queryKey: podCatalogQueryOptions.queryKey,
      })
      setActiveAction(null)
    },
  })
  const activeActionConfig = activeAction
    ? POD_CLONE_ACTION_CONFIG[activeAction]
    : null
  const activeDialogConfig = activeAction
    ? POD_HEADER_DIALOG_CONFIG[activeAction]
    : null
  const actionPending = powerMutation.isPending || deleteMutation.isPending
  const actionError =
    activeAction === "reclone"
      ? null
      : activeAction === "delete"
        ? deleteMutation.error
        : powerMutation.error
  const visibleActions = POD_CLONE_POWER_ACTIONS_BY_STATUS[clonedPod.status]

  function openAction(action: PodCloneAction) {
    powerMutation.reset()
    deleteMutation.reset()
    setActiveAction(action)
  }

  function handleActionOpenChange(open: boolean) {
    if (open) return
    setActiveAction(null)
    powerMutation.reset()
    deleteMutation.reset()
  }

  function confirmActiveAction() {
    if (!activeAction) return

    if (activeAction === "reclone") {
      setActiveAction(null)
      onReclone?.()
      return
    }

    if (activeAction === "delete") {
      deleteMutation.mutate({ clonedPodId: clonedPod.id })
      return
    }

    powerMutation.mutate({
      clonedPodId: clonedPod.id,
      action: activeAction,
    })
  }

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
                      onClick={() => openAction(action)}
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

      {activeActionConfig && activeDialogConfig && (
        <AlertDialog
          open={activeAction != null}
          onOpenChange={handleActionOpenChange}
        >
          <AppAlertDialogContent
            open={activeAction != null}
            icon={activeActionConfig.icon}
            title={activeDialogConfig.title}
            description={activeDialogConfig.description}
          >
            {actionError && (
              <InlineErrorAlert error={actionError} fallback="Action failed." />
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>
                Close
              </AlertDialogCancel>
              <AppActionButton
                type="button"
                variant={activeActionConfig.variant}
                pending={actionPending}
                pendingLabel={`${activeActionConfig.pendingLabel}...`}
                onClick={confirmActiveAction}
              >
                {activeActionConfig.label}
              </AppActionButton>
            </AlertDialogFooter>
          </AppAlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
