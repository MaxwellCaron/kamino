import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import {
  IconChevronRight,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUsersGroup,
} from "@tabler/icons-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import type { ConfirmConfig } from "@/components/inventory-confirm-actions"
import type { ApiPrincipal } from "@/lib/queries"
import { ConfirmDialog } from "@/components/inventory-confirm-actions"
import {
  deleteGroup,
  groupMembersQueryOptions,
  groupsQueryOptions,
  triggerADSync,
} from "@/lib/queries"
import { CreateGroupDialog } from "@/components/group-dialog"
import { MembershipDialog } from "@/components/membership-dialog"

export const Route = createFileRoute("/_dashboard/groups")({
  component: GroupsPage,
})

function GroupsPage() {
  const { data: groups, isLoading, error } = useQuery(groupsQueryOptions)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
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

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        {isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-sm text-destructive">
            {error.message}
          </div>
        )}

        {groups && groups.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No groups found. Create one or sync from principal provider.
            </CardContent>
          </Card>
        )}

        {groups && groups.length > 0 && (
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
            <CardContent className="border-y px-0">
              <Table>
                <TableHeader className="bg-muted hover:bg-muted">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Name</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead className="w-24 pr-6 text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.map((g) => (
                    <>
                      <TableRow key={g.id}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() =>
                              setExpandedGroup(
                                expandedGroup === g.id ? null : g.id
                              )
                            }
                          >
                            <IconChevronRight
                              className={`size-4 transition-transform ${expandedGroup === g.id ? "rotate-90" : ""}`}
                            />
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">
                          {g.name ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {g.external_id}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setMembershipTarget(g)}
                              title="Edit Members"
                            >
                              <IconPencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() =>
                                setConfirm({
                                  title: "Delete Group",
                                  description: `Are you sure you want to delete ${g.name ?? g.external_id}? This will remove the group from Active Directory.`,
                                  actionLabel: "Delete",
                                  variant: "destructive",
                                  onConfirm: () =>
                                    deleteMutation.mutateAsync(g.id),
                                })
                              }
                              title="Delete"
                            >
                              <IconTrash className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedGroup === g.id && (
                        <TableRow key={`${g.id}-members`}>
                          <TableCell colSpan={4} className="bg-muted/30 p-0">
                            <GroupMembersRow groupId={g.id} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="justify-end text-muted-foreground">
              {groups.length} result{groups.length !== 1 && "s"}
            </CardFooter>
          </Card>
        )}
      </div>

      <CreateGroupDialog
        defaultOU=""
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

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

function GroupMembersRow({ groupId }: { groupId: string }) {
  const { data: members, isLoading } = useQuery(
    groupMembersQueryOptions(groupId)
  )

  if (isLoading) {
    return (
      <div className="px-8 py-3 text-sm text-muted-foreground">
        Loading members...
      </div>
    )
  }

  if (!members || members.length === 0) {
    return (
      <div className="px-8 py-3 text-sm text-muted-foreground">No members</div>
    )
  }

  return (
    <div className="px-8 py-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">
        Members ({members.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => (
          <Badge key={m.id} variant="secondary">
            {m.name ?? m.external_id}
            {m.principal_type === "group" && " (group)"}
          </Badge>
        ))}
      </div>
    </div>
  )
}
