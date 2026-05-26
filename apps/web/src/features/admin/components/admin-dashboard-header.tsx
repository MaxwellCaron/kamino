import {
  IconDeviceDesktop,
  IconFolder,
  IconReceipt,
  IconTemplate,
  IconUser,
  IconUsersGroup,
} from "@tabler/icons-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Item, ItemMedia, ItemTitle } from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"
import type { ReactNode } from "@tabler/icons-react"
import type { AdminStats } from "../utils/admin-dashboard"
import { LoadingTransition } from "@/components/loading-transition"

type Stat = {
  icon: ReactNode
  label: string
  value: string
  detail?: string | null
}

function buildStats(stats: AdminStats | null): Array<Stat> {
  return [
    {
      icon: <IconUser className="size-5 text-muted-foreground" />,
      label: "Users",
      value: stats ? String(stats.users) : "—",
      detail: "Principal accounts with direct login or identity mapping.",
    },
    {
      icon: <IconUsersGroup className="size-5 text-muted-foreground" />,
      label: "Groups",
      value: stats ? String(stats.groups) : "—",
      detail: "Collections of principals sharing permissions and access.",
    },
    {
      icon: <IconFolder className="size-5 text-muted-foreground" />,
      label: "Folders",
      value: stats ? String(stats.folders) : "—",
      detail: "Inventory folders organizing and scoping infrastructure.",
    },
    {
      icon: <IconDeviceDesktop className="size-5 text-muted-foreground" />,
      label: "VMs",
      value: stats ? String(stats.vms) : "—",
      detail: "Virtual machines provisioned and managed in the cluster.",
    },
    {
      icon: <IconTemplate className="size-5 text-muted-foreground" />,
      label: "Templates",
      value: stats ? String(stats.templates) : "—",
      detail: "Reusable VM images available for cloning and deployment.",
    },
    {
      icon: <IconReceipt className="size-5 text-muted-foreground" />,
      label: "Requests",
      value: stats ? String(stats.requests) : "—",
      detail: "Total requests for VM power and snapshot operations.",
    },
  ]
}

export function AdminDashboardHeader({
  isLoading,
  stats,
}: {
  isLoading: boolean
  stats: AdminStats | null
}) {
  const statCards = buildStats(stats)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-4xl font-extrabold tracking-tight text-balance">
          Admin Dashboard
        </CardTitle>
        <CardDescription>
          Platform statistics, requests management, principals overview, and
          cluster health.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 grid-rows-3 gap-4 lg:grid-cols-3 lg:grid-rows-2 lg:gap-6 2xl:grid-cols-6 2xl:grid-rows-1">
          {statCards.map((stat) => {
            return (
              <Item
                key={stat.label}
                variant="muted"
                className="relative flex-col items-start overflow-hidden"
              >
                <div className="flex items-center gap-3.5">
                  <ItemMedia>{stat.icon}</ItemMedia>
                  <ItemTitle className="text-muted-foreground">
                    {stat.label}
                  </ItemTitle>
                </div>
                <LoadingTransition
                  isLoading={isLoading}
                  fallback={
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-16 rounded-md" />
                      <Skeleton
                        className={`h-4 rounded-md ${stat.detail ? "w-24" : "w-0 opacity-0"}`}
                      />
                    </div>
                  }
                >
                  <div className="flex min-h-15 flex-col items-start gap-1">
                    <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
                      {stat.value}
                    </h3>
                    <div className="min-h-5">
                      {stat.detail && (
                        <p className="text-sm text-muted-foreground">
                          {stat.detail}
                        </p>
                      )}
                    </div>
                  </div>
                </LoadingTransition>
              </Item>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
