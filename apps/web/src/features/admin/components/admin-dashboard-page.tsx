import { useMemo, useState } from "react"
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { IconArrowUpRight, IconUser, IconUsersGroup } from "@tabler/icons-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import { toast } from "sonner"
import {
  buildStorageByNode,
  countInventoryStats,
  formatMutationError,
  getRecentPrincipals,
  getRecentRequests,
} from "../utils/admin-dashboard"
import { AdminClusterCard } from "./admin-cluster-card"
import { AdminDashboardHeader } from "./admin-dashboard-header"
import { getPrincipalColumns } from "./admin-principal-columns"
import { AdminDashboardActionButtons } from "./admin-dashboard-action-buttons"
import type { AdminStats } from "../utils/admin-dashboard"
import type { AuthUser } from "@/features/auth/types/auth-types"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import {
  ManagementPermissionKeys,
  hasManagementPermission,
} from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  groupsQueryOptions,
  usersQueryOptions,
} from "@/features/principals/api/principals-api"
import {
  approveRequest,
  denyRequest,
  requestDetailQueryOptions,
  requestsQueryOptions,
} from "@/features/requests/api/requests-api"
import { RequestDetailDialog } from "@/features/requests/components/request-detail-dialog"
import { getRequestColumns } from "@/features/requests/components/requests-columns"
import {
  nodesQueryOptions,
  storagesQueryOptions,
} from "@/features/vms/api/proxmox-options-api"
import { SimpleDataTable } from "@/components/data-table/simple-data-table"

export function AdminDashboardPage({ user }: { user: AuthUser }) {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )
  const queryClient = useQueryClient()
  const usersQuery = useQuery(usersQueryOptions)
  const groupsQuery = useQuery(groupsQueryOptions)
  const inventoryQuery = useQuery(inventoryTreeQueryOptions)
  const pendingRequestsQuery = useQuery(requestsQueryOptions("pending"))
  const completedRequestsQuery = useQuery(requestsQueryOptions("completed"))
  const nodesQuery = useQuery(nodesQueryOptions)
  const detailQuery = useQuery({
    ...requestDetailQueryOptions(selectedRequestId ?? ""),
    enabled: !!selectedRequestId,
  })
  const canReview = hasManagementPermission(
    user.management_permissions,
    ManagementPermissionKeys.manager
  )

  const storageQueries = useQueries({
    queries: (nodesQuery.data ?? []).map((node) =>
      storagesQueryOptions(node.node)
    ),
  })

  const requestColumns = useMemo(
    () =>
      getRequestColumns({
        onOpen: (request) => setSelectedRequestId(request.id),
        selectable: false,
        tree: inventoryQuery.data,
        excludeColumns: ["status", "reviewer_username", "updated_at"],
      }),
    [inventoryQuery.data]
  )
  const userColumns = useMemo(
    () => getPrincipalColumns({ icon: IconUser, label: "User" }),
    []
  )
  const groupColumns = useMemo(
    () => getPrincipalColumns({ icon: IconUsersGroup, label: "Group" }),
    []
  )

  const approveMutation = useMutation({
    mutationFn: approveRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] })
    },
  })

  const denyMutation = useMutation({
    mutationFn: denyRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] })
    },
  })

  const pendingRequests = useMemo(
    () => getRecentRequests(pendingRequestsQuery.data ?? []),
    [pendingRequestsQuery.data]
  )

  const recentUsers = useMemo(
    () => getRecentPrincipals(usersQuery.data ?? []),
    [usersQuery.data]
  )

  const recentGroups = useMemo(
    () => getRecentPrincipals(groupsQuery.data ?? []),
    [groupsQuery.data]
  )

  const adminStats = useMemo<AdminStats | null>(() => {
    if (
      !usersQuery.data ||
      !groupsQuery.data ||
      !inventoryQuery.data ||
      !pendingRequestsQuery.data ||
      !completedRequestsQuery.data
    ) {
      return null
    }
    const { folders, vms, templates } = countInventoryStats(inventoryQuery.data)
    return {
      users: usersQuery.data.length,
      groups: groupsQuery.data.length,
      folders,
      vms,
      templates,
      requests:
        pendingRequestsQuery.data.length + completedRequestsQuery.data.length,
    }
  }, [
    usersQuery.data,
    groupsQuery.data,
    inventoryQuery.data,
    pendingRequestsQuery.data,
    completedRequestsQuery.data,
  ])

  const storageByNode = useMemo(() => {
    return buildStorageByNode(
      nodesQuery.data ?? [],
      storageQueries.map((query) => query.data)
    )
  }, [nodesQuery.data, storageQueries])

  const nodes = nodesQuery.data ?? []

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6 xl:grid xl:grid-cols-12">
        <div className="xl:col-span-12">
          <AdminDashboardHeader
            isLoading={
              usersQuery.isLoading ||
              groupsQuery.isLoading ||
              inventoryQuery.isLoading ||
              pendingRequestsQuery.isLoading ||
              completedRequestsQuery.isLoading
            }
            stats={adminStats}
          />
        </div>

        <AdminClusterCard nodes={nodes} storageByNode={storageByNode} />

        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
              Pending Requests
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Newest requests waiting for review.
            </CardDescription>
            <CardAction>
              <Button
                nativeButton={false}
                size="sm"
                render={
                  <Link
                    to="/manager/requests"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Queue
                    <IconArrowUpRight className="size-4" />
                  </Link>
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <SimpleDataTable
              columns={requestColumns}
              data={pendingRequests}
              error={pendingRequestsQuery.error}
              getRowId={(request: ApiRequestSummary) => request.id}
              isLoading={pendingRequestsQuery.isLoading}
              skeletonRows={3}
            />
          </CardContent>
        </Card>

        <div className="xl:col-span-5">
          <AdminDashboardActionButtons />
        </div>

        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
              Groups
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Last five created group principals.
            </CardDescription>
            <CardAction>
              <Button
                nativeButton={false}
                size="sm"
                render={
                  <Link
                    to="/admin/principals/groups"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    All Groups
                    <IconArrowUpRight className="size-4" />
                  </Link>
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <SimpleDataTable
              columns={groupColumns}
              data={recentGroups}
              error={groupsQuery.error}
              getRowId={(principal: ApiPrincipal) => principal.id}
              isLoading={groupsQuery.isLoading}
              skeletonRows={3}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
              Users
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Last five created user principals.
            </CardDescription>
            <CardAction>
              <Button
                nativeButton={false}
                size="sm"
                render={
                  <Link
                    to="/admin/principals/users"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    All Users
                    <IconArrowUpRight className="size-4" />
                  </Link>
                }
              />
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <SimpleDataTable
              columns={userColumns}
              data={recentUsers}
              error={usersQuery.error}
              getRowId={(principal: ApiPrincipal) => principal.id}
              isLoading={usersQuery.isLoading}
              skeletonRows={3}
            />
          </CardContent>
        </Card>
      </div>

      <RequestDetailDialog
        canReview={canReview}
        error={detailQuery.error}
        isLoading={detailQuery.isLoading}
        onApprove={() => {
          if (!selectedRequestId) {
            return
          }
          const id = selectedRequestId
          setSelectedRequestId(null)
          toast.promise(approveMutation.mutateAsync([id]), {
            loading: "Approving request...",
            success: (result) => {
              if (result.failed.length > 0) {
                throw new Error(result.failed[0].error)
              }
              return "Request approved"
            },
            error: formatMutationError,
          })
        }}
        onDeny={() => {
          if (!selectedRequestId) {
            return
          }
          const id = selectedRequestId
          setSelectedRequestId(null)
          toast.promise(denyMutation.mutateAsync([id]), {
            loading: "Denying request...",
            success: (result) => {
              if (result.failed.length > 0) {
                throw new Error(result.failed[0].error)
              }
              return "Request denied"
            },
            error: formatMutationError,
          })
        }}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequestId(null)
          }
        }}
        open={selectedRequestId !== null}
        request={detailQuery.data ?? null}
        tree={inventoryQuery.data}
      />
    </div>
  )
}
