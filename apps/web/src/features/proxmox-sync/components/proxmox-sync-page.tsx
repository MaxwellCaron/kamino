import { Suspense, lazy, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Navigate, getRouteApi } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconRefresh,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { ActionBarItem } from "@workspace/ui/components/action-bar"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type {
  ConfirmConfig,
  ConfirmStatusItem,
} from "@/components/dialogs/confirm-dialog"
import type {
  SyncApplyResult,
  SyncChange,
  SyncSelection,
} from "@/features/proxmox-sync/api/proxmox-sync-api"
import {
  ManagementPermissionKeys,
  canAccessAdmin,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  applyProxmoxSync,
  proxmoxSyncPreviewQueryOptions,
} from "@/features/proxmox-sync/api/proxmox-sync-api"
import { getSyncDiffColumns } from "@/features/proxmox-sync/components/sync-diff-columns"
import { DataTable } from "@/components/data-table/data-table"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { TablePageSkeleton } from "@/components/loading-skeletons"

const syncRouteApi = getRouteApi("/_dashboard/admin/proxmox-sync")
const ConfirmDialog = lazy(() =>
  import("@/components/dialogs/confirm-dialog").then((m) => ({
    default: m.ConfirmDialog,
  }))
)

function allChanges(
  adds: Array<SyncChange>,
  removes: Array<SyncChange>,
  updates: Array<SyncChange>
): Array<SyncChange> {
  return [...adds, ...removes, ...updates]
}

function buildStatusItems(
  selected: Array<SyncChange>
): Array<ConfirmStatusItem> {
  return selected.map((c) => ({
    id: c.id,
    kind: "vm" as const,
    label: c.name,
    description: `${c.node}/${c.vmid} — ${c.kind}`,
    status: "idle" as const,
  }))
}

function buildSyncSelection(selected: Array<SyncChange>): SyncSelection {
  const selection: SyncSelection = {
    add_ids: [],
    remove_ids: [],
    update_ids: [],
  }

  for (const row of selected) {
    if (row.kind === "add") {
      selection.add_ids.push(row.id)
    } else if (row.kind === "remove") {
      selection.remove_ids.push(row.id)
    } else {
      selection.update_ids.push(row.id)
    }
  }

  return selection
}

function applyResultToStatus(
  item: ConfirmStatusItem,
  result: SyncApplyResult
): ConfirmStatusItem {
  if (result.status === "success") {
    return {
      ...item,
      status: "success",
      successDisplay: result.kind === "remove" ? "deleted" : "vm",
    }
  }
  if (result.status === "error") {
    return { ...item, status: "error", error: result.error }
  }
  return { ...item, status: "error", error: result.error ?? "skipped" }
}

export function ProxmoxSyncPage() {
  const { user } = syncRouteApi.useRouteContext()
  const canAdminister = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.administrator
  )
  const {
    data: diff,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    ...proxmoxSyncPreviewQueryOptions,
    enabled: canAdminister,
  })
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)

  const columns = useMemo(() => getSyncDiffColumns(), [])

  const rows = useMemo(() => {
    if (!diff) return []
    return allChanges(diff.adds, diff.removes, diff.updates)
  }, [diff])

  if (!canAccessAdmin(user.management_permissions)) {
    return <Navigate to="/" />
  }

  if (isLoading) {
    return <TablePageSkeleton titleWidth="w-48" />
  }

  const adds: Array<SyncChange> = diff ? diff.adds : []
  const removes: Array<SyncChange> = diff ? diff.removes : []
  const updates: Array<SyncChange> = diff ? diff.updates : []
  const blocked = removes.filter((r) => r.removable === false).length
  const isEmpty =
    adds.length === 0 && removes.length === 0 && updates.length === 0

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        {diff?.warning && (
          <Alert variant="destructive">
            <IconAlertTriangle className="size-4" />
            <AlertDescription>{diff.warning}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <IconRefresh className="size-7 text-muted-foreground" />
              <h1 className="scroll-m-20 pr-2 text-center text-4xl font-extrabold tracking-tight text-balance">
                Proxmox Sync
              </h1>
              {adds.length > 0 && (
                <Badge className="bg-emerald-600/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
                  +{adds.length}
                </Badge>
              )}
              {removes.length > 0 && (
                <Badge className="bg-destructive/10 text-destructive">
                  -{removes.length}
                </Badge>
              )}
              {updates.length > 0 && (
                <Badge className="bg-amber-600/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400">
                  ~{updates.length}
                </Badge>
              )}
              {blocked > 0 && (
                <Badge
                  variant="outline"
                  className="text-muted-foreground tabular-nums"
                >
                  {blocked} blocked
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Review drift between Proxmox and inventory. Select changes and
              apply.
            </CardDescription>
            <CardAction>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <IconRefresh
                  className={isFetching ? "animate-spin" : ""}
                  data-icon="inline-start"
                />
                Refresh
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {error ? (
              <div className="mx-6 py-6">
                <InlineErrorAlert
                  error={error}
                  fallback="Failed to load sync preview."
                  title="Sync Error"
                />
              </div>
            ) : isEmpty ? (
              <div className="mx-6">
                <Empty className="min-h-[80vh] border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconCircleCheck className="size-6 text-primary" />
                    </EmptyMedia>
                    <EmptyTitle>Synced</EmptyTitle>
                    <EmptyDescription>
                      Proxmox has {diff?.proxmox_vm_count ?? 0} VMs, all
                      matching inventory.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                isLoading={isLoading}
                error={error}
                getRowId={(c) => c.id}
                selectionActions={({ selectedRows, clearSelection }) => {
                  const selectableRows = selectedRows.filter(
                    (r) => !(r.kind === "remove" && r.removable === false)
                  )
                  if (selectableRows.length === 0) return null

                  return (
                    <ActionBarItem
                      onSelect={(e) => e.preventDefault()}
                      onClick={() => {
                        const statusItems = buildStatusItems(selectableRows)
                        setConfirm({
                          title: "Apply Sync Changes",
                          icon: IconRefresh,
                          description: `Apply ${selectableRows.length} selected change${selectableRows.length === 1 ? "" : "s"} to the inventory.`,
                          actionLabel: "Apply",
                          variant: "default",
                          closeOnSuccess: false,
                          statusItems,
                          onConfirm: async ({ setStatusItems }) => {
                            setStatusItems((prev) =>
                              prev.map((item) => ({
                                ...item,
                                status: "pending",
                              }))
                            )

                            const selection = buildSyncSelection(selectableRows)

                            try {
                              const response = await applyProxmoxSync(selection)
                              const resultsByID = new Map(
                                response.results.map((r) => [r.id, r])
                              )

                              setStatusItems((prev) =>
                                prev.map((item) => {
                                  const result = resultsByID.get(item.id)
                                  return result
                                    ? applyResultToStatus(item, result)
                                    : {
                                        ...item,
                                        status: "error",
                                        error: "no result",
                                      }
                                })
                              )

                              const { applied, failed, skipped } = response
                              if (failed === 0 && skipped === 0) {
                                toast.success(
                                  `Synced ${applied} change${applied === 1 ? "" : "s"}`
                                )
                              } else {
                                toast.warning(
                                  `Applied ${applied}, failed ${failed}, skipped ${skipped}`
                                )
                              }

                              await queryClient.invalidateQueries({
                                queryKey:
                                  proxmoxSyncPreviewQueryOptions.queryKey,
                              })
                              await queryClient.invalidateQueries({
                                queryKey: inventoryTreeQueryOptions.queryKey,
                              })
                              clearSelection()
                            } catch (err) {
                              setStatusItems((prev) =>
                                prev.map((item) => ({
                                  ...item,
                                  status: "error",
                                  error:
                                    err instanceof Error
                                      ? err.message
                                      : "Unknown error",
                                }))
                              )
                              toast.error(
                                err instanceof Error
                                  ? err.message
                                  : "Sync failed"
                              )
                            }
                          },
                        })
                      }}
                    >
                      <IconRefresh data-icon="inline-start" />
                      Sync {selectableRows.length} change
                      {selectableRows.length === 1 ? "" : "s"}
                    </ActionBarItem>
                  )
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Suspense fallback={null}>
        {confirm && (
          <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
        )}
      </Suspense>
    </div>
  )
}
