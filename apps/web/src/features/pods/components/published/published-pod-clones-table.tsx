import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { m } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete01Icon,
  PackageRemoveIcon,
  PlayIcon,
  ReloadIcon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { Badge } from "@workspace/ui/components/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { PublishedPodCloneActionsMenu } from "./published-pod-clone-actions-menu"
import type { IconSvgElement } from "@hugeicons/react"
import type { ClonedPodPowerAction } from "@/features/pods/api/clone-pod-api"
import type {
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
} from "@/features/pods/types/pod-types"
import type { PublishedPodClonePendingAction } from "@/features/pods/types/published-pods-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import {
  deletePublishedPodClone,
  podCatalogQueryOptions,
  powerPublishedPodClone,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
  reclonePublishedPodClone,
} from "@/features/pods/api/publish-pod-api"
import { ClonedPodStatusBadge } from "@/features/pods/components/cloned-pod-status-badge"
import { POD_CLONE_ACTION_CONFIG } from "@/features/pods/utils/pod-clone-actions"

const CLONE_ACTION_DIALOG_CONFIG: Record<
  Exclude<PublishedPodClonePendingAction, null>["type"],
  {
    title: string
    description: (clone: PublishedPodCloneSummary) => string
    actionLabel: string
    icon: IconSvgElement
    variant: "default" | "destructive"
  }
> = {
  start: {
    title: "Start Clone?",
    description: (clone) =>
      `Start all VMs in the clone owned by ${clone.owner.label}.`,
    actionLabel: "Start",
    icon: PlayIcon,
    variant: "default",
  },
  shutdown: {
    title: "Shut Down Clone?",
    description: (clone) =>
      `Shut down all VMs in the clone owned by ${clone.owner.label}.`,
    actionLabel: "Shut Down",
    icon: StopIcon,
    variant: "destructive",
  },
  reclone: {
    title: "Re-clone Clone?",
    description: (clone) =>
      `Delete and recreate the VMs in the clone owned by ${clone.owner.label}. Task progress and question answers stay.`,
    actionLabel: "Re-clone",
    icon: ReloadIcon,
    variant: "destructive",
  },
  delete: {
    title: "Delete Clone?",
    description: (clone) =>
      `Delete the clone owned by ${clone.owner.label}. This removes the Proxmox VMs and inventory folder.`,
    actionLabel: "Delete",
    icon: Delete01Icon,
    variant: "destructive",
  },
}

export function PublishedPodClonesTable({ pod }: { pod: PublishedPodCatalogEntry }) {
  const queryClient = useQueryClient()
  const [pendingAction, setPendingAction] =
    useState<PublishedPodClonePendingAction>(null)

  const {
    data: clones,
    isLoading,
    error,
  } = useQuery({
    ...publishedPodClonesQueryOptions(pod.id),
    retryOnMount: false,
  })

  const clonesQueryKey = publishedPodClonesQueryOptions(pod.id).queryKey

  const powerMutation = useMutation({
    mutationFn: (params: {
      clonedPodId: string
      action: ClonedPodPowerAction
    }) => powerPublishedPodClone({ podId: pod.id, ...params }),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        clonesQueryKey,
        (current: Array<PublishedPodCloneSummary> | undefined) =>
          current?.map((c) => (c.id === updated.id ? updated : c)) ?? []
      )
      setPendingAction(null)
    },
    onError: () => {
      setPendingAction(null)
    },
  })

  const recloneMutation = useMutation({
    mutationFn: (clonedPodId: string) =>
      reclonePublishedPodClone({ podId: pod.id, clonedPodId }),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        clonesQueryKey,
        (current: Array<PublishedPodCloneSummary> | undefined) =>
          current?.map((c) => (c.id === updated.id ? updated : c)) ?? []
      )
      setPendingAction(null)
    },
    onError: () => {
      setPendingAction(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (clonedPodId: string) =>
      deletePublishedPodClone({ podId: pod.id, clonedPodId }),
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData(
        clonesQueryKey,
        (current: Array<PublishedPodCloneSummary> | undefined) =>
          current?.filter((c) => c.id !== deletedId) ?? []
      )
      void queryClient.invalidateQueries({
        queryKey: publishedPodsQueryOptions.queryKey,
      })
      void queryClient.invalidateQueries({
        queryKey: podCatalogQueryOptions.queryKey,
      })
      setPendingAction(null)
    },
    onError: () => {
      setPendingAction(null)
    },
  })

  const isMutating =
    powerMutation.isPending ||
    recloneMutation.isPending ||
    deleteMutation.isPending

  const confirm: ConfirmConfig | null = pendingAction
    ? (() => {
        const cfg = CLONE_ACTION_DIALOG_CONFIG[pendingAction.type]
        const clone = pendingAction.clone
        const onConfirm = () => {
          const actionConfig = POD_CLONE_ACTION_CONFIG[pendingAction.type]
          const cloneName = clone.owner.label

          if (
            pendingAction.type === "start" ||
            pendingAction.type === "shutdown"
          ) {
            showSingleMutationToast({
              title: actionConfig.pendingLabel,
              name: cloneName,
              promise: () =>
                powerMutation.mutateAsync({
                  clonedPodId: clone.id,
                  action: pendingAction.type,
                }),
              successDescription:
                pendingAction.type === "start" ? "Started" : "Shut down",
            })
          } else if (pendingAction.type === "reclone") {
            showSingleMutationToast({
              title: "Re-cloning",
              name: cloneName,
              promise: () => recloneMutation.mutateAsync(clone.id),
              successDescription: "Re-cloned",
            })
          } else {
            showSingleMutationToast({
              title: "Deleting",
              name: cloneName,
              promise: () => deleteMutation.mutateAsync(clone.id),
              successDescription: "Deleted",
            })
          }
        }
        return {
          title: cfg.title,
          description: cfg.description(clone),
          actionLabel: cfg.actionLabel,
          icon: cfg.icon,
          variant: cfg.variant,
          onConfirm,
        }
      })()
    : null

  return (
    <div>
      {isLoading ? null : (
        <m.div
          initial={{ opacity: 0, transform: "translateY(-4px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
        >
          {error ? (
            <InlineErrorAlert
              error={error}
              fallback="Failed to load clones."
              className="mx-4 my-3"
            />
          ) : clones && clones.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-7">Principal</TableHead>
                    <TableHead>Cloned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead>VMs</TableHead>
                    <TableHead>Tasks</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clones.map((clone) => (
                    <TableRow key={clone.id} className="hover:bg-muted/50">
                      <TableCell className="pl-7">
                        <div className="flex items-center gap-2">
                          <span className="max-w-48 truncate text-sm font-medium">
                            {clone.owner.label}
                          </span>
                          <Badge variant="outline" className="w-fit text-xs">
                            {clone.owner.type.charAt(0).toUpperCase() +
                              clone.owner.type.slice(1)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <RelativeTimeCard
                          date={clone.cloned_at}
                          delay={50}
                          closeDelay={150}
                        />
                      </TableCell>
                      <TableCell>
                        <ClonedPodStatusBadge status={clone.status} />
                      </TableCell>
                      <TableCell>{clone.network.vnet}</TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {clone.vm_count}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="tabular-nums">
                          {clone.task_summary.completed}/
                          {clone.task_summary.total}
                        </span>
                        {clone.task_summary.total > 0 && (
                          <span className="ml-1.5 text-muted-foreground tabular-nums">
                            {Math.round(clone.task_summary.progress)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="pr-7">
                        <PublishedPodCloneActionsMenu
                          clone={clone}
                          isMutating={isMutating}
                          onAction={setPendingAction}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon
                    icon={PackageRemoveIcon}
                    className="text-muted-foreground"
                  />
                </EmptyMedia>
                <EmptyTitle>No clones yet</EmptyTitle>
                <EmptyDescription>
                  No users have cloned this pod.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </m.div>
      )}

      {confirm && (
        <ConfirmDialog
          config={confirm}
          onClose={() => setPendingAction(null)}
        />
      )}
    </div>
  )
}
