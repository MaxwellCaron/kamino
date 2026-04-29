import {
  IconDashboard,
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
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"
import type { ReactNode } from "@tabler/icons-react"
import { LoadingTransition } from "@/components/loading-transition"

type Stat = {
  icon: ReactNode
  label: string
  value: string
  detail?: string | null
}

function buildStats(): Array<Stat> {
  return [
    {
      icon: <IconUser className="size-5 text-muted-foreground" />,
      label: "Users",
      value: "—",
      detail: "Principal accounts with direct login or identity mapping.",
    },
    {
      icon: <IconUsersGroup className="size-5 text-muted-foreground" />,
      label: "Groups",
      value: "—",
      detail: "Inventory folders organizing visible infrastructure.",
    },
    {
      icon: <IconFolder className="size-5 text-muted-foreground" />,
      label: "Folders",
      value: "—",
      detail: "Inventory folders organizing visible infrastructure.",
    },
    {
      icon: <IconDeviceDesktop className="size-5 text-muted-foreground" />,
      label: "Virtual Machines",
      value: "—",
      detail: "Created virtual machines.",
    },
    {
      icon: <IconTemplate className="size-5 text-muted-foreground" />,
      label: "Templates",
      value: "—",
      detail: "Templates for creating virtual machines.",
    },
    {
      icon: <IconReceipt className="size-5 text-muted-foreground" />,
      label: "Requests",
      value: "—",
      detail: "Pending requests for virtual machine creation.",
    },
  ]
}

export function AdminDashboardHeader({ isLoading }: { isLoading: boolean }) {
  const stats = buildStats()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconDashboard className="size-7 text-muted-foreground" />
          <span className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
            Admin Dashboard
          </span>
        </CardTitle>
        <CardDescription>
          Control-plane health, request flow, and cluster capacity.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 grid-rows-3 gap-4 lg:grid-cols-3 lg:grid-rows-2 lg:gap-6 2xl:grid-cols-6 2xl:grid-rows-1">
          {stats.map((stat) => {
            return (
              <Item
                key={stat.label}
                variant="muted"
                className="relative overflow-hidden pr-10"
              >
                <ItemMedia>{stat.icon}</ItemMedia>
                <ItemContent className="w-full gap-3">
                  <ItemTitle className="text-muted-foreground">
                    {stat.label}
                  </ItemTitle>
                </ItemContent>
                <ItemFooter>
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
                </ItemFooter>
              </Item>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
