import { useEffect, useMemo, useState } from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Link, createFileRoute } from "@tanstack/react-router"
import { IconArrowUpRight, IconSettings } from "@tabler/icons-react"
import { z } from "zod"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { DataTable } from "@/components/data-table/data-table"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
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
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiRequestSummary } from "@/features/requests/types/request-types"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { GrainientBackground } from "@/components/grainient-background"
import { changeOwnPassword } from "@/features/auth/api/auth-api"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { VmIcon } from "@/features/inventory/components/tree/vm-icon"
import { useInventoryFavorites } from "@/features/inventory/hooks/use-inventory-favorites"
import { findTreePath } from "@/features/inventory/utils/inventory-tree"
import {
  requestDetailQueryOptions,
  requesterRequestsQueryOptions,
} from "@/features/requests/api/requests-api"
import { RequestDetailDialog } from "@/features/requests/components/request-detail-dialog"
import {
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
  getRequestIcon,
  getRequestStatusClassName,
} from "@/features/requests/utils/request-presenters"
import { formatVmReference } from "@/features/shared/utils/format"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"

const dashboardTabs = ["Overview", "Activity"] as const

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export const Route = createFileRoute("/_dashboard/")({
  component: DashboardHomePage,
})

function DashboardHomePage() {
  const { user } = Route.useRouteContext()
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
        .filter((item): item is ApiTreeNode => !!item && item.kind === "vm"),
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
      getActivityColumns({
        onOpen: (request) => setSelectedRequestId(request.id),
        tree: treeQuery.data,
      }),
    [treeQuery.data]
  )

  const activityError =
    (pendingRequestsQuery.error as Error | null) ??
    (historyRequestsQuery.error as Error | null) ??
    null

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

  return (
    <>
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
          <div className="min-h-[90vh] rounded-4xl bg-card">
            <div className="relative h-48 w-full overflow-hidden rounded-t-4xl">
              <GrainientBackground />
            </div>

            <div className="relative mx-auto max-w-5xl">
              <div className="-mt-12 flex flex-col gap-4 px-4 pb-4 sm:px-6 lg:px-0">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-end gap-4">
                    <FacehashIcon name={user.username} size={80} />
                    <div className="pb-2">
                      <h1 className="font-heading text-2xl tracking-tight">
                        {user.username}
                      </h1>
                      <div className="text-sm text-muted-foreground">
                        @{user.username} · User
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <Button type="button" onClick={() => setSettingsOpen(true)}>
                      <IconSettings data-icon="inline-start" />
                      Settings
                    </Button>
                  </div>
                </div>

                <Tabs defaultValue="Overview" className="w-full">
                  <div className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <TabsList variant="line">
                      {dashboardTabs.map((tab) => (
                        <TabsTrigger key={tab} value={tab}>
                          {tab}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
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
                        <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
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
                                        <IconArrowUpRight />
                                      </ItemActions>
                                    </Link>
                                  }
                                />
                              )
                            })
                          ) : (
                            <Empty className="rounded-3xl border border-dashed bg-muted/20 p-8">
                              <EmptyHeader>
                                <EmptyMedia variant="icon">
                                  <IconArrowUpRight />
                                </EmptyMedia>
                                <EmptyTitle>No favorites yet</EmptyTitle>
                                <EmptyDescription>
                                  Add VMs to favorites from the inventory tree
                                  to pin them here.
                                </EmptyDescription>
                              </EmptyHeader>
                            </Empty>
                          )}
                        </div>
                      </section>

                      <section>
                        <div className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
                          Recent activity
                        </div>
                        {recentRequests.length > 0 ? (
                          <ul className="mt-3 flex flex-col gap-2.5">
                            {recentRequests.map((request) => (
                              <li
                                key={request.id}
                                className="flex items-baseline gap-2 text-sm text-foreground/85"
                              >
                                <span className="size-1.5 rounded-full bg-foreground/40" />
                                <span className="truncate text-muted-foreground">
                                  {getRequestTitle(request)}
                                </span>
                                <Badge
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
                                      request.updated_at ??
                                      request.created_at ??
                                      new Date().toISOString()
                                    }
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
                          <Empty className="mt-3 rounded-3xl border border-dashed bg-muted/20 p-8">
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
                    <DataTable
                      columns={activityColumns}
                      data={requests}
                      isLoading={activityLoading}
                      error={activityError}
                      getRowId={(request: ApiRequestSummary) => request.id}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </div>
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

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: changeOwnPassword,
    onSuccess: () => {
      toast.success("Password updated")
      onOpenChange(false)
    },
  })

  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      const parsed = changePasswordSchema.safeParse(value)
      if (!parsed.success) {
        setSubmitError(parsed.error.issues[0]?.message ?? "Invalid password")
        return
      }

      setSubmitError(null)
      await mutation.mutateAsync({
        current_password: parsed.data.currentPassword,
        new_password: parsed.data.newPassword,
      })
    },
  })

  useEffect(() => {
    if (!open) {
      form.reset()
      setSubmitError(null)
      mutation.reset()
    }
  }, [form, mutation, open])

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={IconSettings}
      title="Settings"
      description="Change your password by confirming the current one first."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field
            name="currentPassword"
            validators={{
              onBlur: ({ value }) => {
                const result =
                  changePasswordSchema.shape.currentPassword.safeParse(value)
                return result.success
                  ? undefined
                  : result.error.issues[0].message
              },
            }}
          >
            {(field) => (
              <Field
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <FieldLabel htmlFor="current-password">
                  Current Password
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  />
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field
            name="newPassword"
            validators={{
              onBlur: ({ value }) => {
                const result =
                  changePasswordSchema.shape.newPassword.safeParse(value)
                return result.success
                  ? undefined
                  : result.error.issues[0].message
              },
            }}
          >
            {(field) => (
              <Field
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <FieldLabel htmlFor="new-password">New Password</FieldLabel>
                <FieldContent>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  />
                  <FieldDescription>
                    Use at least 8 characters.
                  </FieldDescription>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="confirmPassword">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="confirm-password">
                  Confirm New Password
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <FieldError>{submitError ?? mutation.error?.message}</FieldError>
        </FieldGroup>

        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton disabled={isSubmitting}>
                {isSubmitting ? "Updating..." : "Update Password"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}

function getActivityColumns({
  onOpen,
  tree,
}: {
  onOpen: (request: ApiRequestSummary) => void
  tree?: Array<ApiTreeNode>
}): Array<ColumnDef<ApiRequestSummary>> {
  return [
    {
      accessorKey: "kind",
      header: () => <p className="pl-4">Request</p>,
      cell: ({ row: { original: request } }) => {
        const Icon = getRequestIcon(
          request.kind,
          request.inventory?.power_action
        )
        const path =
          tree && request.inventory?.item_id
            ? findTreePath(tree, request.inventory.item_id)
            : null
        const pathLabel = path
          ? path
              .slice(0, -1)
              .map((node) => node.name)
              .join(" / ")
          : null

        return (
          <div className="flex items-center gap-3 pl-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-secondary text-secondary-foreground">
              <Icon className="size-5" />
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="font-medium">{getRequestTitle(request)}</div>
              <p className="truncate text-xs text-muted-foreground">
                {pathLabel ? `${pathLabel} / ` : ""}
                {getRequestTargetLabel(request)}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row: { original: request } }) => (
        <Badge className={getRequestStatusClassName(request.status)}>
          {formatRequestStatus(request.status)}
        </Badge>
      ),
    },
    {
      accessorKey: "created_at",
      header: "Requested",
      cell: ({ row: { original: request } }) =>
        request.created_at ? (
          <RelativeTimeCard
            date={request.created_at}
            timezones={["UTC"]}
            delay={50}
            closeDelay={150}
          />
        ) : (
          "—"
        ),
    },
    {
      accessorKey: "updated_at",
      header: "Updated",
      cell: ({ row: { original: request } }) =>
        request.updated_at && request.status !== "pending" ? (
          <RelativeTimeCard
            date={request.updated_at}
            timezones={["UTC"]}
            delay={50}
            closeDelay={150}
          />
        ) : (
          "—"
        ),
    },
    {
      id: "actions",
      meta: { className: "w-0" },
      header: () => null,
      cell: ({ row: { original: request } }) => (
        <div className="flex justify-end pr-6">
          <Button variant="outline" size="sm" onClick={() => onOpen(request)}>
            View
            <IconArrowUpRight data-icon="inline-end" />
          </Button>
        </div>
      ),
    },
  ]
}

function getRequestTitle(request: ApiRequestSummary) {
  const powerAction = formatRequestPowerAction(request.inventory?.power_action)
  if (powerAction) {
    return powerAction
  }

  if (request.inventory?.snapshot_name) {
    return `${formatRequestKind(request.kind)}: ${request.inventory.snapshot_name}`
  }

  return formatRequestKind(request.kind)
}

function getRequestTargetLabel(request: ApiRequestSummary) {
  if (request.inventory?.vmid) {
    return formatVmReference(
      request.inventory.vmid,
      request.inventory.item_name ?? undefined
    )
  }

  return request.inventory?.item_name ?? "Inventory item"
}

function getRequestSortTime(request: ApiRequestSummary) {
  const value = request.updated_at ?? request.created_at
  if (!value) return 0
  return new Date(value).getTime()
}

function countAccessibleInventory(nodes: Array<ApiTreeNode>): {
  folders: number
  vms: number
} {
  return nodes.reduce(
    (counts, node) => {
      if (node.kind === "folder") {
        counts.folders += 1
      } else {
        counts.vms += 1
      }

      if (node.children) {
        const childCounts = countAccessibleInventory(node.children)
        counts.folders += childCounts.folders
        counts.vms += childCounts.vms
      }

      return counts
    },
    { folders: 0, vms: 0 }
  )
}

function indexInventoryTree(nodes: Array<ApiTreeNode>) {
  const items = new Map<string, ApiTreeNode>()

  const visit = (entries: Array<ApiTreeNode>) => {
    for (const entry of entries) {
      items.set(entry.id, entry)
      if (entry.children) {
        visit(entry.children)
      }
    }
  }

  visit(nodes)

  return items
}
