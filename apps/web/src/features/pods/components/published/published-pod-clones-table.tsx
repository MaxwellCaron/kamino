import { useState } from "react"
import { toast } from "sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  IconBolt,
  IconDotsVertical,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
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
import type {
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
} from "@/features/pods/types/pod-types"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import {
  deletePublishedPodClone,
  podCatalogQueryOptions,
  powerPublishedPodClone,
  publishedPodClonesQueryOptions,
  publishedPodsQueryOptions,
  reclonePublishedPodClone,
} from "@/features/pods/api/publish-pod-api"
import { ClonedPodStatusBadge } from "@/features/pods/components/cloned-pod-status-badge"
import {
  POD_CLONE_ACTION_CONFIG,
  canRunPodCloneAction,
} from "@/features/pods/utils/pod-clone-actions"

type PendingAction =
  | { type: "start" | "shutdown"; clone: PublishedPodCloneSummary }
  | { type: "reclone"; clone: PublishedPodCloneSummary }
  | { type: "delete"; clone: PublishedPodCloneSummary }
  | null

export function PublishedPodClonesTable({
  pod,
}: {
  pod: PublishedPodCatalogEntry
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
      ) : !clones || clones.length === 0 ? (
        <Empty className="py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconBolt />
            </EmptyMedia>
            <EmptyTitle>No clones yet</EmptyTitle>
            <EmptyDescription>No users have cloned this pod.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
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
                      {clone.task_summary.completed}/{clone.task_summary.total}
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
            disabled={!canRunPodCloneAction(clone.status, "start") || isMutating}
            onClick={() => onAction({ type: "start", clone })}
          >
            <IconPlayerPlay className="text-muted-foreground" />
            {POD_CLONE_ACTION_CONFIG.start.label}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!canRunPodCloneAction(clone.status, "shutdown") || isMutating}
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
