import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  IconCubeOff,
  IconDotsVertical,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { ItemGroup } from "@workspace/ui/components/item"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import type { ClonedPodPowerAction } from "@/features/pods/api/clone-pod-api"
import type { CloneStatusTask } from "@/features/pods/types/clone-status"
import type {
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
} from "@/features/pods/types/pod-types"
import type { PendingCloneRow } from "@/features/pods/types/published-pods-types"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import { clonePodProgressQueryOptions } from "@/features/pods/api/clone-pod-api"
import {
  deletePublishedPodClone,
  podCatalogQueryOptions,
  powerPublishedPodClone,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
  reclonePublishedPodClone,
} from "@/features/pods/api/publish-pod-api"
import { DEFAULT_CLONE_TASKS } from "@/features/pods/types/clone-status"
import { ClonedPodStatusBadge } from "@/features/pods/components/cloned-pod-status-badge"
import {
  POD_CLONE_ACTION_CONFIG,
  canRunPodCloneAction,
} from "@/features/pods/utils/pod-clone-actions"
import { CloneStatusItem } from "@/features/pods/components/clone/clone-status-item"
import {
  FAILED_PROGRESS_COLORS,
  getProgressStepColors,
} from "@/components/progress-state/progress-state-colors"

type PendingAction =
  | { type: "start" | "shutdown"; clone: PublishedPodCloneSummary }
  | { type: "reclone"; clone: PublishedPodCloneSummary }
  | { type: "delete"; clone: PublishedPodCloneSummary }
  | null

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export function PublishedPodClonesTable({
  pod,
  pendingRows,
  onDismissPendingRow,
}: {
  pod: PublishedPodCatalogEntry
  pendingRows: Array<PendingCloneRow>
  onDismissPendingRow: (progressId: string) => void
}) {
  const queryClient = useQueryClient()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const {
    data: clones,
    isLoading,
    error,
  } = useQuery(publishedPodClonesQueryOptions(pod.id))

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
      toast.success(
        pendingAction?.type === "start" ? "Clone started." : "Clone shut down."
      )
    },
    onError: (err) => {
      setPendingAction(null)
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to update clone power state."
      )
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
      toast.success("Clone re-cloned.")
    },
    onError: (err) => {
      setPendingAction(null)
      toast.error(
        err instanceof Error ? err.message : "Failed to re-clone clone."
      )
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
      toast.success("Clone deleted.")
    },
    onError: (err) => {
      setPendingAction(null)
      toast.error(
        err instanceof Error ? err.message : "Failed to delete clone."
      )
    },
  })

  const isMutating =
    powerMutation.isPending ||
    recloneMutation.isPending ||
    deleteMutation.isPending

  return (
    <div>
      {isLoading ? (
        <ClonesTableSkeleton />
      ) : error ? (
        <p className="px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load clones."}
        </p>
      ) : (
        <>
          {pendingRows.length > 0 && (
            <ItemGroup
              role="list"
              className="grid p-6 md:grid-cols-2 xl:grid-cols-3"
            >
              {pendingRows.map((row) => (
                <PendingCloneStatusItem
                  key={row.progressId}
                  row={row}
                  pod={pod}
                  onDismiss={onDismissPendingRow}
                />
              ))}
            </ItemGroup>
          )}
          {clones && clones.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-7">Principal</TableHead>
                    <TableHead>Cloned</TableHead>
                    <TableHead>Status</TableHead>
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
                        <CloneActionsMenu
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
          ) : pendingRows.length === 0 ? (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconCubeOff />
                </EmptyMedia>
                <EmptyTitle>No clones yet</EmptyTitle>
                <EmptyDescription>
                  No users have cloned this pod.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </>
      )}

      <AlertDialog
        open={
          pendingAction?.type === "start" || pendingAction?.type === "shutdown"
        }
        onOpenChange={(open) => {
          if (!open && !isMutating) setPendingAction(null)
        }}
      >
        <AppAlertDialogContent
          open={
            pendingAction?.type === "start" ||
            pendingAction?.type === "shutdown"
          }
          icon={
            pendingAction?.type === "start" ? IconPlayerPlay : IconPlayerStop
          }
          title={
            pendingAction?.type === "start"
              ? "Start Clone?"
              : "Shut Down Clone?"
          }
          description={
            pendingAction?.clone
              ? pendingAction.type === "start"
                ? `Start all VMs in the clone owned by ${pendingAction.clone.owner.label}.`
                : `Shut down all VMs in the clone owned by ${pendingAction.clone.owner.label}.`
              : ""
          }
        >
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isMutating}
              onClick={(e) => {
                e.preventDefault()
                if (
                  !pendingAction ||
                  (pendingAction.type !== "start" &&
                    pendingAction.type !== "shutdown")
                )
                  return
                powerMutation.mutate({
                  clonedPodId: pendingAction.clone.id,
                  action: pendingAction.type,
                })
              }}
            >
              {pendingAction?.type === "start" ? "Start" : "Shut Down"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingAction?.type === "reclone"}
        onOpenChange={(open) => {
          if (!open && !isMutating) setPendingAction(null)
        }}
      >
        <AppAlertDialogContent
          open={pendingAction?.type === "reclone"}
          icon={IconRefresh}
          title="Re-clone Clone?"
          description={
            pendingAction?.type === "reclone"
              ? `Delete and recreate the VMs in the clone owned by ${pendingAction.clone.owner.label}. Task progress and question answers stay.`
              : ""
          }
        >
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isMutating}
              onClick={(e) => {
                e.preventDefault()
                if (pendingAction?.type !== "reclone") return
                recloneMutation.mutate(pendingAction.clone.id)
              }}
            >
              Re-clone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingAction?.type === "delete"}
        onOpenChange={(open) => {
          if (!open && !isMutating) setPendingAction(null)
        }}
      >
        <AppAlertDialogContent
          open={pendingAction?.type === "delete"}
          icon={IconTrash}
          title="Delete Clone?"
          description={
            pendingAction?.type === "delete"
              ? `Delete the clone owned by ${pendingAction.clone.owner.label}. This removes the Proxmox VMs and inventory folder.`
              : ""
          }
        >
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isMutating}
              onClick={(e) => {
                e.preventDefault()
                if (pendingAction?.type !== "delete") return
                deleteMutation.mutate(pendingAction.clone.id)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PendingCloneStatusItem({
  row,
  onDismiss,
}: {
  row: PendingCloneRow
  pod: PublishedPodCatalogEntry
  onDismiss: (progressId: string) => void
}) {
  const { data: progressData } = useQuery(
    clonePodProgressQueryOptions(row.progressId, row.state === "running")
  )

  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const currentStep =
    progressData?.step_id ??
    (row.state === "queued" ? 0 : row.state === "running" ? 1 : 0)
  const isFailed = row.state === "error" || progressData?.state === "error"
  const isFinished = row.state === "success" && !isFailed
  const isCloning =
    row.state !== "queued" ||
    progressData?.state === "running" ||
    progressData?.state === "success" ||
    progressData?.state === "error"

  useEffect(() => {
    if (!isCloning || isFinished || isFailed) return
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [isCloning, isFinished, isFailed])

  const tasks: Array<CloneStatusTask> = DEFAULT_CLONE_TASKS.map((task) => {
    if (!isCloning || row.state === "queued")
      return { ...task, status: "pending" }
    if (isFinished || currentStep > task.id)
      return { ...task, status: "completed" }
    if (currentStep === task.id) return { ...task, status: "in-progress" }
    return { ...task, status: "pending" }
  })
  const activeTask = tasks.find((task) => task.status === "in-progress")
  const colors = isFailed
    ? FAILED_PROGRESS_COLORS
    : getProgressStepColors(activeTask?.id)

  return (
    <div className="relative">
      <CloneStatusItem
        title={
          <>
            {row.principal.label}{" "}
            <Badge variant="outline" className="text-xs">
              {row.principal.type.charAt(0).toUpperCase() +
                row.principal.type.slice(1)}
            </Badge>
          </>
        }
        tasks={tasks}
        isCloning={isCloning}
        isFinished={isFinished}
        isFailed={isFailed}
        colors={colors}
        elapsedTime={formatTime(elapsedSeconds)}
        defaultExpanded={row.state !== "queued"}
      />

      {row.state === "error" && (
        <div className="absolute top-2 right-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Dismiss failed clone for ${row.principal.label}`}
            onClick={() => onDismiss(row.progressId)}
          >
            <IconX className="text-muted-foreground" />
          </Button>
        </div>
      )}
    </div>
  )
}

function CloneActionsMenu({
  clone,
  isMutating,
  onAction,
}: {
  clone: PublishedPodCloneSummary
  isMutating: boolean
  onAction: (action: PendingAction) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for clone owned by ${clone.owner.label}`}
            disabled={isMutating}
          />
        }
      >
        <IconDotsVertical className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={
              !canRunPodCloneAction(clone.status, "start") || isMutating
            }
            onClick={() => onAction({ type: "start", clone })}
          >
            <IconPlayerPlay className="text-muted-foreground" />
            {POD_CLONE_ACTION_CONFIG.start.label}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={
              !canRunPodCloneAction(clone.status, "shutdown") || isMutating
            }
            onClick={() => onAction({ type: "shutdown", clone })}
          >
            <POD_CLONE_ACTION_CONFIG.shutdown.icon className="text-muted-foreground" />
            {POD_CLONE_ACTION_CONFIG.shutdown.label}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={isMutating}
            onClick={() => onAction({ type: "reclone", clone })}
          >
            <IconRefresh />
            {POD_CLONE_ACTION_CONFIG.reclone.label}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={isMutating}
            onClick={() => onAction({ type: "delete", clone })}
          >
            <IconTrash />
            {POD_CLONE_ACTION_CONFIG.delete.label}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ClonesTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-7">Principal</TableHead>
            <TableHead>Cloned</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>VMs</TableHead>
            <TableHead>Tasks</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 2 }, (_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell className="pl-7">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-4 w-14 rounded" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-4 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12 rounded" />
              </TableCell>
              <TableCell className="pr-7">
                <Skeleton className="size-8 rounded" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
