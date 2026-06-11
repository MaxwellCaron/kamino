import { Fragment, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  AlertDialog,
  AlertDialogAction,
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
import {
  IconChevronDown,
  IconLoader2,
  IconPlayerPlay,
  IconPower,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react"
import type { ComponentType } from "react"
import type {
  ClonedPod,
  ClonedPodStatus,
} from "@/features/pods/types/pod-types"
import {
  deleteClonedPod,
  powerClonedPod,
} from "@/features/pods/api/clone-pod-api"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"

type PodHeaderAction = "start" | "shutdown" | "reclone" | "delete"
type VisiblePodHeaderAction = Exclude<PodHeaderAction, "reclone" | "delete">
type PodHeaderActionIcon = ComponentType<{ className?: string }>

const POD_HEADER_ACTION_CONFIG: Record<
  PodHeaderAction,
  {
    icon: PodHeaderActionIcon
    title: string
    description: string
    menuDescription: string
    actionLabel: string
    pendingLabel: string
    variant: "default" | "destructive"
  }
> = {
  start: {
    icon: IconPlayerPlay,
    title: "Start Pod?",
    description: "This will power on all virtual machines in your cloned pod.",
    menuDescription: "Power on all of the virtual machines in the pod.",
    actionLabel: "Start",
    pendingLabel: "Starting",
    variant: "default",
  },
  shutdown: {
    icon: IconPower,
    title: "Shutdown Pod?",
    description:
      "This will send a shutdown signal to all running virtual machines in your cloned pod.",
    menuDescription: "Safely power off all of the virtual machines in the pod.",
    actionLabel: "Shutdown",
    pendingLabel: "Shutting down",
    variant: "destructive",
  },
  reclone: {
    icon: IconRefresh,
    title: "Re-clone Pod?",
    description:
      "This deletes and recreates your cloned virtual machines while keeping your saved task progress and question answers.",
    menuDescription: "Recreate the virtual machines and keep task progress.",
    actionLabel: "Re-clone",
    pendingLabel: "Preparing",
    variant: "destructive",
  },
  delete: {
    icon: IconTrash,
    title: "Delete Pod?",
    description:
      "This permanently deletes your cloned pod, its virtual machines, and your saved task progress.",
    menuDescription: "Permanently delete your cloned instance of this pod.",
    actionLabel: "Delete",
    pendingLabel: "Deleting",
    variant: "destructive",
  },
}

const VISIBLE_ACTIONS_BY_STATUS: Record<
  ClonedPodStatus,
  Array<VisiblePodHeaderAction>
> = {
  running: ["shutdown"],
  stopped: ["start"],
  partial: ["start", "shutdown"],
}

const ACTION_BUTTON_VARIANT: Record<
  VisiblePodHeaderAction,
  "default" | "secondary" | "destructive"
> = {
  start: "default",
  shutdown: "destructive",
}

const OVERFLOW_ACTIONS: Array<PodHeaderAction> = ["reclone", "delete"]

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
  const [activeAction, setActiveAction] = useState<PodHeaderAction | null>(null)
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
    ? POD_HEADER_ACTION_CONFIG[activeAction]
    : null
  const actionPending = powerMutation.isPending || deleteMutation.isPending
  const actionError =
    activeAction === "reclone"
      ? null
      : activeAction === "delete"
        ? deleteMutation.error
        : powerMutation.error
  const visibleActions = VISIBLE_ACTIONS_BY_STATUS[clonedPod.status]

  function openAction(action: PodHeaderAction) {
    powerMutation.reset()
    deleteMutation.reset()
    setActiveAction(action)
  }

  function handleActionOpenChange(open: boolean) {
    if (open || actionPending) return
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
        {visibleActions.map((action, _) => {
          const config = POD_HEADER_ACTION_CONFIG[action]
          const Icon = config.icon

          return (
            <Fragment key={action}>
              <Button
                variant={ACTION_BUTTON_VARIANT[action]}
                disabled={actionPending}
                onClick={() => openAction(action)}
              >
                <Icon data-icon="inline-start" />
                {config.actionLabel}
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
                <IconChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent className="w-full" align="end">
            <DropdownMenuGroup>
              {OVERFLOW_ACTIONS.map((action) => {
                const config = POD_HEADER_ACTION_CONFIG[action]
                const Icon = config.icon

                return (
                  <Fragment key={action}>
                    <DropdownMenuItem
                      variant={
                        action === "reclone" || action === "delete"
                          ? "destructive"
                          : undefined
                      }
                      disabled={
                        actionPending || (action === "reclone" && !onReclone)
                      }
                      onClick={() => openAction(action)}
                    >
                      <Item className="w-full p-2">
                        <ItemMedia variant="icon">
                          <Icon className="size-4" />
                        </ItemMedia>
                        <ItemContent className="gap-0">
                          <ItemTitle>{config.actionLabel}</ItemTitle>
                          <ItemDescription className="leading-none">
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

      {activeActionConfig && (
        <AlertDialog
          open={activeAction != null}
          onOpenChange={handleActionOpenChange}
        >
          <AppAlertDialogContent
            open={activeAction != null}
            icon={activeActionConfig.icon}
            title={activeActionConfig.title}
            description={activeActionConfig.description}
          >
            {actionError && (
              <p className="text-sm text-destructive">{actionError.message}</p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant={activeActionConfig.variant}
                disabled={actionPending}
                onClick={confirmActiveAction}
              >
                {actionPending && (
                  <IconLoader2
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                )}
                {actionPending
                  ? `${activeActionConfig.pendingLabel}...`
                  : activeActionConfig.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AppAlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
