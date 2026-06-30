import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { buttonVariants } from "@workspace/ui/components/button"
import type { ColumnDef } from "@tanstack/react-table"
import type { ApiPrincipal } from "@/features/principals/types/principals-types"
import { SimpleDataTable } from "@/components/data-table/simple-data-table"

type AdminDashboardPrincipalsCardsProps = {
  groupColumns: Array<ColumnDef<ApiPrincipal>>
  recentGroups: Array<ApiPrincipal>
  groupsError: Error | null
  isGroupsLoading: boolean
  userColumns: Array<ColumnDef<ApiPrincipal>>
  recentUsers: Array<ApiPrincipal>
  usersError: Error | null
  isUsersLoading: boolean
}

export function AdminDashboardPrincipalsCards({
  groupColumns,
  recentGroups,
  groupsError,
  isGroupsLoading,
  userColumns,
  recentUsers,
  usersError,
  isUsersLoading,
}: AdminDashboardPrincipalsCardsProps) {
  return (
    <>
      <Card className="xl:col-span-5">
        <CardHeader>
          <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Groups
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Last five created group principals.
          </CardDescription>
          <CardAction>
            <Link to="/admin/principals/groups" className={buttonVariants()}>
              All Groups
              <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <SimpleDataTable
            columns={groupColumns}
            data={recentGroups}
            error={groupsError}
            getRowId={(principal: ApiPrincipal) => principal.id}
            isLoading={isGroupsLoading}
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
            <Link to="/admin/principals/users" className={buttonVariants()}>
              All Users
              <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" />
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <SimpleDataTable
            columns={userColumns}
            data={recentUsers}
            error={usersError}
            getRowId={(principal: ApiPrincipal) => principal.id}
            isLoading={isUsersLoading}
          />
        </CardContent>
      </Card>
    </>
  )
}
