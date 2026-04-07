import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { IconPlus, IconRefresh, IconUsers } from "@tabler/icons-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import type { ApiPrincipal } from "@/lib/queries"
import type { ConfirmConfig } from "@/components/inventory-confirm-actions"
import { ConfirmDialog } from "@/components/inventory-confirm-actions"
import { deleteUser, triggerADSync, usersQueryOptions } from "@/lib/queries"
import { CreateUserDialog } from "@/components/user-dialog"
import { PasswordDialog } from "@/components/password-dialog"
import { MembershipDialog } from "@/components/membership-dialog"
import { DataTable } from "@/components/data-table"
import { getUserColumns } from "@/components/users-columns"

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

  const columns = useMemo(
    () =>
      getUserColumns({
        onEditGroups: setMembershipTarget,
        onSetPassword: setPasswordTarget,
        onDeleteClick: (user) =>
          setConfirm({
            title: "Delete User",
            description: `Are you sure you want to delete ${user.name ?? user.external_id}? This will remove the user from Active Directory.`,
            actionLabel: "Delete",
            variant: "destructive",
            onConfirm: () => deleteMutation.mutateAsync(user.id),
          }),
      }),
    [deleteMutation]
  )

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
                disabled={syncMutation.isPending || isLoading || error !== null}
              >
                <IconRefresh data-icon="inline-start" />
                <span className="hidden lg:block">
                  {syncMutation.isPending ? "Syncing..." : "Sync"}
                </span>
              </Button>
              <Button
                onClick={() => setCreateOpen(true)}
                disabled={isLoading || error !== null}
              >
                <IconPlus data-icon="inline-start" />
                <span className="hidden lg:block">Create User</span>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={users || []}
              isLoading={isLoading}
              error={error}
            />
          </CardContent>
        </Card>
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
