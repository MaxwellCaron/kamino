import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { IconPlus, IconRefresh, IconUsersGroup } from "@tabler/icons-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import type { ConfirmConfig } from "@/components/inventory-confirm-actions"
import type { ApiPrincipal } from "@/lib/queries"
import { ConfirmDialog } from "@/components/inventory-confirm-actions"
import { deleteGroup, groupsQueryOptions, triggerADSync } from "@/lib/queries"
import { CreateGroupDialog } from "@/components/group-dialog"
import { MembershipDialog } from "@/components/membership-dialog"
import { getGroupColumns } from "@/components/groups-columns"
import { DataTable } from "@/components/data-table"

export const Route = createFileRoute("/_dashboard/groups")({
  component: GroupsPage,
})

function GroupsPage() {
  const { data: groups, isLoading, error } = useQuery(groupsQueryOptions)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [membershipTarget, setMembershipTarget] = useState<ApiPrincipal | null>(
    null
  )

  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGroup(id),
    onSuccess: () => {
      toast.success("Group deleted")
      queryClient.invalidateQueries({ queryKey: ["principals", "groups"] })
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const syncMutation = useMutation({
    mutationFn: triggerADSync,
    onSuccess: () => {
      toast.success("AD sync complete")
      queryClient.invalidateQueries({ queryKey: ["principals"] })
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const columns = useMemo(
    () =>
      getGroupColumns({
        onEditGroups: setMembershipTarget,
        onDeleteClick: (group) =>
          setConfirm({
            title: "Delete Group",
            description: `Are you sure you want to delete ${group.name ?? group.external_id}? This will permanently remove the group.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => deleteMutation.mutateAsync(group.id),
          }),
      }),
    [deleteMutation]
  )

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconUsersGroup className="size-7" />
              <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
                Groups
              </h1>
            </CardTitle>
            <CardDescription>
              List of groups from your principal provider.
            </CardDescription>
            <CardAction className="space-x-2">
              <Button
                variant="outline"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
              >
                <IconRefresh data-icon="inline-start" />
                {syncMutation.isPending ? "Syncing..." : "Sync"}
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <IconPlus data-icon="inline-start" />
                Create Group
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={groups || []}
              isLoading={isLoading}
              error={error}
            />
          </CardContent>
        </Card>
      </div>

      <CreateGroupDialog open={createOpen} onOpenChange={setCreateOpen} />

      {membershipTarget && (
        <MembershipDialog
          mode="group-members"
          principal={membershipTarget}
          open={!!membershipTarget}
          onOpenChange={(isOpen) => {
            if (!isOpen) setMembershipTarget(null)
          }}
        />
      )}

      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
