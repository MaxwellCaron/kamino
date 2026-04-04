import {
  IconCpu,
  IconDatabase,
  IconDeviceImac,
  IconDots,
  IconId,
  IconPackages,
  IconTopologyBus,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import type { ReactNode } from "react"
import { VncConsole } from "@/components/vnc-console"

type InventoryItem = {
  id: string
  parent_id: string | null
  kind: "folder" | "vm"
  name: string
  inherit_permissions: boolean
  vm?: {
    node: string
    vmid: number
    cpu_count?: number
    memory_mb?: number
    disk_gb?: number
  }
}

async function fetchInventoryItem(itemId: string): Promise<InventoryItem> {
  const res = await fetch(`/api/v1/inventory/items/${itemId}`)
  if (!res.ok) throw new Error(`Failed to fetch item: ${res.status}`)
  return res.json()
}

function formatMemory(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`
}

export const Route = createFileRoute("/_dashboard/vm/$itemId")({
  component: VmPage,
})

function VmPage() {
  const { itemId } = Route.useParams()

  const {
    data: item,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["inventory", "item", itemId],
    queryFn: () => fetchInventoryItem(itemId),
  })

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="flex flex-1 items-center justify-center text-destructive">
        {error?.message ?? "Item not found"}
      </div>
    )
  }

  if (!item.vm) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        This item is not a virtual machine.
      </div>
    )
  }

  const { vm } = item

  const stats: Array<{ icon: ReactNode; label: string; value: string }> = [
    {
      icon: <IconPackages className="size-5" />,
      label: "Node",
      value: vm.node,
    },
    {
      icon: <IconId className="size-5" />,
      label: "VMID",
      value: String(vm.vmid),
    },
    {
      icon: <IconCpu className="size-5" />,
      label: "CPU",
      value: vm.cpu_count != null ? `${vm.cpu_count} CPUs` : "—",
    },
    {
      icon: <IconTopologyBus className="size-5 rotate-180" />,
      label: "Memory",
      value: vm.memory_mb != null ? formatMemory(vm.memory_mb) : "—",
    },
    {
      icon: <IconDatabase className="size-5" />,
      label: "Storage",
      value: vm.disk_gb != null ? `${vm.disk_gb} GB` : "—",
    },
  ]

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconDeviceImac className="size-5" />
              {item.name}
            </CardTitle>
            <CardDescription>Virtual Machine</CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon-lg">
                <IconDots />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-4 md:gap-6">
              {stats.map((stat) => (
                <Item key={stat.label} variant="muted">
                  <ItemMedia>{stat.icon}</ItemMedia>
                  <ItemContent>
                    <ItemTitle>{stat.label}</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Badge>{stat.value}</Badge>
                  </ItemActions>
                </Item>
              ))}
            </div>
          </CardContent>
        </Card>
        <VncConsole node={vm.node} vmid={vm.vmid} />
      </div>
    </div>
  )
}
