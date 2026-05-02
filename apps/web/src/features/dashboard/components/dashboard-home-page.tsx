import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { IconArrowUpRight, IconSettings } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  countAccessibleInventory,
  getRecentActivityTitle,
  getRequestSortTime,
  getRequestTargetLabel,
  indexInventoryTree,
} from "../utils/dashboard-utils"
import { ChangePasswordDialog } from "./change-password-dialog"
import { getDashboardActivityColumns } from "./dashboard-activity-columns"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import type { AuthUser } from "@/features/auth/types/auth-types"
import { getManagementRoleLabel } from "@/features/auth/utils/management-permissions"
import { DataTable } from "@/components/data-table/data-table"
import { GrainientBackground } from "@/components/grainient-background"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { VmIcon } from "@/features/inventory/components/tree/vm-icon"
import { useInventoryFavorites } from "@/features/inventory/hooks/use-inventory-favorites"
import {
  requestDetailQueryOptions,
  requesterRequestsQueryOptions,
} from "@/features/requests/api/requests-api"
import { RequestDetailDialog } from "@/features/requests/components/request-detail-dialog"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"

const dashboardTabs = ["Overview", "Activity"] as const

export function DashboardHomePage({ user }: { user: AuthUser }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )

  const treeQuery = useQuery(inventoryTreeQueryOptions)
  const pendingRequestsQuery = useQuery(
    requesterRequestsQueryOptions("pending")
  )
  const historyRequestsQuery = useQuery(
    requesterRequestsQueryOptions("history")
  )
  const detailQuery = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })
  const { favoriteIds } = useInventoryFavorites()
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)

  const inventoryStats = useMemo(
    () => countAccessibleInventory(treeQuery.data ?? []),
    [treeQuery.data]
  )

  const inventoryItemsById = useMemo(
    () => indexInventoryTree(treeQuery.data ?? []),
    [treeQuery.data]
  )

  const favorites = useMemo(
    () =>
      Array.from(favoriteIds)
        .map((itemId) => inventoryItemsById.get(itemId))
        .filter(
          (item): item is NonNullable<typeof item> =>
            !!item && item.kind === "vm"
        ),
    [favoriteIds, inventoryItemsById]
  )

  const requests = useMemo(
    () =>
      [
        ...(pendingRequestsQuery.data ?? []),
        ...(historyRequestsQuery.data ?? []),
      ].sort(
        (left, right) => getRequestSortTime(right) - getRequestSortTime(left)
      ),
    [historyRequestsQuery.data, pendingRequestsQuery.data]
  )

  const recentRequests = requests.slice(0, 4)

  const activityColumns = useMemo(
    () =>
      getDashboardActivityColumns({
        onOpen: (request) => setSelectedRequestId(request.id),
        tree: treeQuery.data,
      }),
    [treeQuery.data]
  )

  const activityError = pendingRequestsQuery.error ?? historyRequestsQuery.error

  const activityLoading =
    pendingRequestsQuery.isLoading || historyRequestsQuery.isLoading

  const stats = [
    {
      label: "Groups",
      value: String(user.group_count),
    },
    {
      label: "Folders",
      value: treeQuery.isLoading ? "—" : String(inventoryStats.folders),
    },
    {
      label: "Virtual Machines",
      value: treeQuery.isLoading ? "—" : String(inventoryStats.vms),
    },
  ]
  const roleLabel = getManagementRoleLabel(user.management_permissions)

  return (
    <>
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
          <Card className="min-h-[90vh] rounded-4xl pt-0">
            <div className="relative h-48 w-full overflow-hidden">
              <GrainientBackground />
            </div>

            <CardHeader className="relative mx-auto -mt-18.5 flex w-full max-w-5xl items-end justify-between gap-4 px-4 sm:px-6">
              <div className="flex min-w-0 items-end gap-4">
                <FacehashIcon name={user.username} size={80} />
                <div className="min-w-0 pb-2">
                  <CardTitle className="truncate text-2xl tracking-tight">
                    {user.username}
                  </CardTitle>
                  <CardDescription>{roleLabel}</CardDescription>
                </div>
              </div>
              <CardAction className="shrink-0 self-end pb-2">
                <Button type="button" onClick={() => setSettingsOpen(true)}>
                  <IconSettings data-icon="inline-start" />
                  Settings
                </Button>
              </CardAction>
            </CardHeader>

            <CardContent className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-4 sm:px-6">
              <Tabs defaultValue="Overview" className="w-full">
                <div className="flex flex-col gap-3 border-b border-border/60 lg:flex-row lg:items-center lg:justify-between">
                  <TabsList variant="line">
                    {dashboardTabs.map((tab) => (
                      <TabsTrigger key={tab} value={tab}>
                        {tab}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <div className="order-first flex flex-wrap items-center gap-4 pb-3 text-xs text-muted-foreground lg:order-0 lg:justify-end lg:pb-0">
                    {stats.map((stat) => (
                      <span key={stat.label}>
                        <span className="font-mono text-foreground">
                          {stat.value}
                        </span>{" "}
                        {stat.label}
                      </span>
                    ))}
                  </div>
                </div>

                <TabsContent value="Overview" className="mt-6">
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
                    <section>
                      <div className="font-semibold text-muted-foreground">
                        Favorites
                      </div>
                      <div className="mt-3 flex flex-col gap-4">
                        {favorites.length > 0 ? (
                          favorites.map((favorite) => {
                            const vmid = favorite.vm?.vmid
                            const status =
                              vmid !== undefined
                                ? vmStatuses?.[vmid]
                                : undefined

                            return (
                              <Item
                                key={favorite.id}
                                variant="muted"
                                size="sm"
                                className="cursor-default"
                                render={
                                  <Link
                                    to="/inventory/items/$itemId"
                                    params={{ itemId: favorite.id }}
                                  >
                                    <ItemMedia>
                                      <VmIcon
                                        status={status}
                                        isTemplate={favorite.vm?.is_template}
                                      />
                                    </ItemMedia>
                                    <ItemContent>
                                      <ItemTitle>{favorite.name}</ItemTitle>
                                      <ItemDescription>
                                        {favorite.vm?.is_template
                                          ? "Template"
                                          : "Virtual Machine"}
                                      </ItemDescription>
                                    </ItemContent>
                                    <ItemActions>
                                      <IconArrowUpRight className="size-4" />
                                    </ItemActions>
                                  </Link>
                                }
                              />
                            )
                          })
                        ) : (
                          <Empty className="rounded-3xl border border-dashed p-8">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <IconArrowUpRight />
                              </EmptyMedia>
                              <EmptyTitle>No favorites yet</EmptyTitle>
                              <EmptyDescription>
                                Add VMs to favorites from the inventory tree to
                                pin them here.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        )}
                      </div>
                    </section>

                    <section>
                      <div className="font-semibold text-muted-foreground">
                        Recent activity
                      </div>
                      {recentRequests.length > 0 ? (
                        <ul className="mt-3 flex flex-col gap-2.5">
                          {recentRequests.map((request) => (
                            <li
                              key={request.id}
                              className="flex min-w-0 items-baseline gap-2 text-sm text-foreground/85"
                            >
                              <span className="size-1.5 rounded-full bg-foreground/40" />
                              <span className="min-w-0 shrink truncate text-muted-foreground">
                                {getRecentActivityTitle(request)}
                              </span>
                              <Badge
                                className="shrink-0"
                                render={
                                  request.inventory?.item_id ? (
                                    <Link
                                      to="/inventory/items/$itemId"
                                      params={{
                                        itemId: request.inventory.item_id,
                                      }}
                                    >
                                      {getRequestTargetLabel(request)}
                                      <IconArrowUpRight data-icon="inline-end" />
                                    </Link>
                                  ) : (
                                    <span>
                                      {getRequestTargetLabel(request)}
                                    </span>
                                  )
                                }
                              />
                              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/80">
                                <RelativeTimeCard
                                  date={
                                    request.created_at ??
                                    new Date().toISOString()
                                  }
                                  display="relative"
                                  timezones={["UTC"]}
                                  delay={50}
                                  closeDelay={150}
                                  variant="muted"
                                />
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Empty className="mt-3 rounded-3xl border border-dashed p-8">
                          <EmptyHeader>
                            <EmptyTitle>No request activity</EmptyTitle>
                            <EmptyDescription>
                              Requests you submit for VM power actions and
                              snapshots will appear here.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      )}
                    </section>
                  </div>
                </TabsContent>

                <TabsContent value="Activity" className="mt-6">
                  <div className="rounded-4xl border py-6">
                    <DataTable
                      columns={activityColumns}
                      data={requests}
                      isLoading={activityLoading}
                      error={activityError}
                      initialPageSize={10}
                      getRowId={(request: ApiRequestSummary) => request.id}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <ChangePasswordDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <RequestDetailDialog
        canReview={false}
        error={detailQuery.error}
        isLoading={detailQuery.isLoading}
        onApprove={() => {}}
        onDeny={() => {}}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequestId(null)
          }
        }}
        open={selectedRequestId !== null}
        request={detailQuery.data ?? null}
        tree={treeQuery.data}
      />
    </>
  )
}
