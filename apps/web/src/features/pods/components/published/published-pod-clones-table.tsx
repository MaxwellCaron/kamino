import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  IconBolt,
  IconCopyPlus,
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
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
import { Progress } from "@workspace/ui/components/progress"
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
import { uuid } from "@workspace/ui/lib/utils"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"
import type { ClonedPodPowerAction } from "@/features/pods/api/clone-pod-api"
import type {
  PublishedPodCatalogEntry,
  PublishedPodCloneSummary,
} from "@/features/pods/types/pod-types"
import { buildPrincipalOptions } from "@/features/inventory/utils/acl-transformers"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import { clonePodProgressQueryOptions } from "@/features/pods/api/clone-pod-api"
import {
  createPublishedPodClone,
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
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"

type PendingAction =
  | { type: "start" | "shutdown"; clone: PublishedPodCloneSummary }
  | { type: "reclone"; clone: PublishedPodCloneSummary }
  | { type: "delete"; clone: PublishedPodCloneSummary }
  | null

type PendingCloneRowState = "queued" | "running" | "success" | "error"

type PendingCloneRow = {
  progressId: string
  principal: PrincipalOption
  state: PendingCloneRowState
  message?: string
}

const CLONE_STEP_COUNT = DEFAULT_CLONE_TASKS.length

export function PublishedPodClonesTable({
  pod,
}: {
  pod: PublishedPodCatalogEntry
}) {
  const queryClient = useQueryClient()
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [pendingRows, setPendingRows] = useState<Array<PendingCloneRow>>([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false)
  const [selectedPrincipals, setSelectedPrincipals] = useState<
    Array<PrincipalOption>
  >([])

  const {
    data: clones,
    isLoading,
    error,
  } = useQuery(publishedPodClonesQueryOptions(pod.id))

  const { data: users } = useQuery(usersQueryOptions)
  const { data: groups } = useQuery(groupsQueryOptions)

  const clonesQueryKey = publishedPodClonesQueryOptions(pod.id).queryKey

  const cloneDialogAnchor = useComboboxAnchor()

  const existingOwnerIds = new Set(clones?.map((c) => c.owner.id) ?? [])
  const pendingPrincipalIds = new Set(pendingRows.map((r) => r.principal.id))

  const allOptions = buildPrincipalOptions(users ?? [], groups ?? [])
  const availableOptions = allOptions.filter(
    (o) => !existingOwnerIds.has(o.id) && !pendingPrincipalIds.has(o.id)
  )

  const principalOptionsLoading = users === undefined || groups === undefined

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

  const runBatch = useCallback(
    async (selected: Array<PrincipalOption>) => {
      const rows: Array<PendingCloneRow> = selected.map((p) => ({
        progressId: uuid(),
        principal: p,
        state: "queued" as const,
      }))
      setPendingRows((prev) => [...prev, ...rows])
      setBatchRunning(true)

      let succeeded = 0
      let failed = 0

      for (const row of rows) {
        setPendingRows((prev) =>
          prev.map((r) =>
            r.progressId === row.progressId ? { ...r, state: "running" } : r
          )
        )

        try {
          const summary = await createPublishedPodClone({
            podId: pod.id,
            principalId: row.principal.id,
            progressId: row.progressId,
          })
          queryClient.setQueryData(
            clonesQueryKey,
            (current: Array<PublishedPodCloneSummary> | undefined) => {
              if (!current) return [summary]
              const exists = current.some((c) => c.id === summary.id)
              return exists
                ? current.map((c) => (c.id === summary.id ? summary : c))
                : [...current, summary]
            }
          )
          void queryClient.invalidateQueries({
            queryKey: publishedPodsQueryOptions.queryKey,
          })
          void queryClient.invalidateQueries({
            queryKey: podCatalogQueryOptions.queryKey,
          })
          setPendingRows((prev) =>
            prev.filter((r) => r.progressId !== row.progressId)
          )
          succeeded++
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Clone failed."
          setPendingRows((prev) =>
            prev.map((r) =>
              r.progressId === row.progressId
                ? { ...r, state: "error", message }
                : r
            )
          )
          failed++
        }
      }

      setBatchRunning(false)

      if (failed === 0) {
        toast.success(
          `Cloned pod for ${succeeded} principal${succeeded !== 1 ? "s" : ""}.`
        )
      } else if (succeeded === 0) {
        toast.error("Failed to clone pod for the selected principals.")
      } else {
        toast.warning(
          `Cloned pod for ${succeeded} principal${succeeded !== 1 ? "s" : ""}; ${failed} failed.`
        )
      }
    },
    [pod.id, queryClient, clonesQueryKey]
  )

  const handleStartCloning = useCallback(() => {
    setCloneDialogOpen(false)
    void runBatch(selectedPrincipals)
    setSelectedPrincipals([])
  }, [selectedPrincipals, runBatch])

  const dismissPendingRow = useCallback((progressId: string) => {
    setPendingRows((prev) => prev.filter((r) => r.progressId !== progressId))
  }, [])

  const hasPendingRows = pendingRows.length > 0
  const hasClones = clones && clones.length > 0
  const showTable = hasClones || hasPendingRows

  return (
    <div>
      <div className="flex items-center justify-end px-7 pb-3 pt-4">
        <Button
          variant="outline"
          size="sm"
          disabled={principalOptionsLoading || batchRunning}
          onClick={() => {
            setSelectedPrincipals([])
            setCloneDialogOpen(true)
          }}
        >
          <IconCopyPlus data-icon="inline-start" />
          Clone principals
        </Button>
      </div>

      {isLoading ? (
        <ClonesTableSkeleton />
      ) : error ? (
        <p className="px-4 py-3 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load clones."}
        </p>
      ) : !showTable ? (
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
              {pendingRows.map((row) => (
                <PendingCloneProgressRow
                  key={row.progressId}
                  row={row}
                  pod={pod}
                  onDismiss={dismissPendingRow}
                />
              ))}
              {clones?.map((clone) => (
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

      <Dialog
        open={cloneDialogOpen}
        onOpenChange={(open) => {
          if (!open) setCloneDialogOpen(false)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Clone For Principals</DialogTitle>
          </DialogHeader>
          <ClonePrincipalsDialogBody
            anchor={cloneDialogAnchor}
            availableOptions={availableOptions}
            selectedPrincipals={selectedPrincipals}
            onSelectionChange={setSelectedPrincipals}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCloneDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={selectedPrincipals.length === 0}
              onClick={handleStartCloning}
            >
              Start Cloning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function ClonePrincipalsDialogBody({
  anchor,
  availableOptions,
  selectedPrincipals,
  onSelectionChange,
}: {
  anchor: ReturnType<typeof useComboboxAnchor>
  availableOptions: Array<PrincipalOption>
  selectedPrincipals: Array<PrincipalOption>
  onSelectionChange: (value: Array<PrincipalOption>) => void
}) {
  const principalOptionMap = new Map(availableOptions.map((o) => [o.id, o]))
  const resolvedSelected = selectedPrincipals
    .map((p) => principalOptionMap.get(p.id))
    .filter((p): p is PrincipalOption => !!p)

  if (availableOptions.length === 0 && selectedPrincipals.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        All principals already have a clone of this pod.
      </p>
    )
  }

  return (
    <Combobox
      multiple
      autoHighlight
      items={availableOptions}
      itemToStringLabel={(p) => p.label}
      value={resolvedSelected}
      onValueChange={(value) =>
        onSelectionChange(value)
      }
    >
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(values) => (
            <>
              {(values as Array<PrincipalOption>).map((p) => (
                <ComboboxChip key={p.id}>{p.label}</ComboboxChip>
              ))}
              <ComboboxChipsInput placeholder="Search for users or groups" />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No principals found.</ComboboxEmpty>
        <ComboboxList>
          {availableOptions.map((p) => (
            <ComboboxItem key={p.id} value={p}>
              <span className="flex-1 truncate">{p.label}</span>
              <Badge variant="outline" className="ml-auto text-xs">
                {p.type.charAt(0).toUpperCase() + p.type.slice(1)}
              </Badge>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

function PendingCloneProgressRow({
  row,
  pod,
  onDismiss,
}: {
  row: PendingCloneRow
  pod: PublishedPodCatalogEntry
  onDismiss: (progressId: string) => void
}) {
  const { data: progressData } = useQuery(
    clonePodProgressQueryOptions(row.progressId, row.state === "running")
  )

  const stepId =
    row.state === "success"
      ? CLONE_STEP_COUNT
      : row.state === "queued"
        ? 0
        : (progressData?.step_id ?? 0)

  const percent = Math.round((stepId / CLONE_STEP_COUNT) * 100)

  const clonedCellLabel =
    row.state === "queued"
      ? "Queued"
      : row.state === "running"
        ? "Cloning"
        : row.state === "error"
          ? "Failed"
          : "Done"

  const statusBadgeVariant: "outline" | "secondary" | "destructive" =
    row.state === "error"
      ? "destructive"
      : row.state === "running"
        ? "secondary"
        : "outline"

  const isActive = row.state === "queued" || row.state === "running"

  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="pl-7">
        <div className="flex items-center gap-2">
          <span className="max-w-48 truncate text-sm font-medium">
            {row.principal.label}
          </span>
          <Badge variant="outline" className="w-fit text-xs">
            {row.principal.type.charAt(0).toUpperCase() +
              row.principal.type.slice(1)}
          </Badge>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {clonedCellLabel}
      </TableCell>
      <TableCell>
        <Badge variant={statusBadgeVariant} className="text-xs">
          {clonedCellLabel}
        </Badge>
      </TableCell>
      <TableCell className="text-sm tabular-nums">
        {pod.virtual_machines.length}
      </TableCell>
      <TableCell className="text-sm">
        <div className="flex flex-col gap-1">
          <Progress
            value={percent}
            className="h-1.5 w-24"
          />
          {progressData?.message && row.state === "running" && (
            <span className="max-w-40 truncate text-xs text-muted-foreground">
              {progressData.message}
            </span>
          )}
          {row.state === "error" && row.message && (
            <span className="max-w-40 truncate text-xs text-destructive">
              {row.message}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="pr-7">
        {row.state === "error" && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Dismiss failed clone for ${row.principal.label}`}
            onClick={() => onDismiss(row.progressId)}
          >
            <IconX className="text-muted-foreground" />
          </Button>
        )}
        {isActive && (
          <div className="size-8" />
        )}
      </TableCell>
    </TableRow>
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
    <div>
      <div className="flex items-center justify-end px-7 pb-3 pt-4">
        <Skeleton className="h-8 w-36 rounded" />
      </div>
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
    </div>
  )
}
