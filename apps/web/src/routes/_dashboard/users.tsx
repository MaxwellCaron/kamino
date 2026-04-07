import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import {
  IconKey,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUsers,
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
import type { ApiPrincipal } from "@/lib/queries"
import type { ConfirmConfig } from "@/components/inventory-confirm-actions"
import { ConfirmDialog } from "@/components/inventory-confirm-actions"
import { deleteUser, triggerADSync, usersQueryOptions } from "@/lib/queries"
import { CreateUserDialog } from "@/components/user-dialog"
import { PasswordDialog } from "@/components/password-dialog"
import { MembershipDialog } from "@/components/membership-dialog"

export const Route = createFileRoute("/_dashboard/users")({
  component: UsersPage,
})

function UsersPage() {
  const { data: users, isLoading, error } = useQuery(usersQueryOptions)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<ApiPrincipal | null>(
    null
  )
  const [membershipTarget, setMembershipTarget] = useState<ApiPrincipal | null>(
    null
  )

  const queryClient = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success("User deleted")
      queryClient.invalidateQueries({ queryKey: ["principals", "users"] })
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

        {users && users.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No users found. Create one or sync from Active Directory.
            </CardContent>
          </Card>
        )}

        {users && users.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconUsers className="size-7" />
                <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
                  Users
                </h1>
              </CardTitle>
              <CardDescription>
                List of users from your principal provider.
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
                  Create User
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="border-y px-0">
              <Table>
                <TableHeader className="bg-muted hover:bg-muted">
                  <TableRow>
                    <TableHead className="pl-6">Name</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead className="w-32 pr-6 text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="pl-6 font-medium">
                        {u.name ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {u.external_id}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setMembershipTarget(u)}
                            title="Edit Groups"
                          >
                            <IconUsersGroup className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setPasswordTarget(u)}
                            title="Set Password"
                          >
                            <IconKey className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() =>
                              setConfirm({
                                title: "Delete User",
                                description: `Are you sure you want to delete ${u.name ?? u.external_id}? This will remove the user from Active Directory.`,
                                actionLabel: "Delete",
                                variant: "destructive",
                                onConfirm: () =>
                                  deleteMutation.mutateAsync(u.id),
                              })
                            }
                            title="Delete"
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="justify-end text-muted-foreground">
              {users.length} result{users.length !== 1 && "s"}
            </CardFooter>
          </Card>
        )}
      </div>

      <CreateUserDialog
        defaultOU=""
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {passwordTarget && (
        <PasswordDialog
          userId={passwordTarget.id}
          userName={passwordTarget.name ?? passwordTarget.external_id}
          open={!!passwordTarget}
          onOpenChange={(isOpen) => {
            if (!isOpen) setPasswordTarget(null)
          }}
        />
      )}

      {membershipTarget && (
        <MembershipDialog
          mode="user-groups"
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
