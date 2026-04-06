import {
  IconCpu,
  IconDatabase,
  IconDeviceImac,
  IconId,
  IconPackages,
  IconPower,
  IconTemplate,
  IconTopologyBus,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Badge } from "@workspace/ui/components/badge"
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
  ItemContent,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import type { ReactNode } from "react"
import { VncConsole } from "@/components/vnc-console"
import { VmOptionsMenu } from "@/components/inventory-actions"
import {
  findTreeNode,
  inventoryTreeQueryOptions,
  vmStatusQueryOptions,
} from "@/lib/queries"

function formatMemory(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`
}

export const Route = createFileRoute("/_dashboard/vm/$itemId")({
  component: VmPage,
})

function VmPage() {
  const { itemId } = Route.useParams()

  const { data: tree, isLoading } = useQuery(inventoryTreeQueryOptions)
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  const node = tree ? findTreeNode(tree, itemId) : null

  if (!node) {
    return (
      <div className="flex flex-1 items-center justify-center text-destructive">
        Item not found
      </div>
    )
  }

  if (!node.vm) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        This item is not a virtual machine.
      </div>
    )
  }

  const { vm } = node
  const isTemplate = vm.is_template
  const vmStatus = vmStatuses?.[vm.vmid]

  const stats: Array<{
    icon: ReactNode
    label: string
    value: string
    variant?: "default" | "secondary" | "destructive" | "outline"
  }> = [
    {
      icon: <IconPower className="size-5 text-muted-foreground" />,
      label: "Status",
      value: isTemplate
        ? "Template"
        : vmStatus
          ? vmStatus.charAt(0).toUpperCase() + vmStatus.slice(1)
          : "—",
      variant: isTemplate
        ? "secondary"
        : vmStatus === "running"
          ? "default"
          : vmStatus === "stopped"
            ? "destructive"
            : "secondary",
    },
    {
      icon: <IconPackages className="size-5 text-muted-foreground" />,
      label: "Node",
      value: vm.node,
    },
    {
      icon: <IconId className="size-5 text-muted-foreground" />,
      label: "VMID",
      value: String(vm.vmid),
    },
    {
      icon: <IconCpu className="size-5 text-muted-foreground" />,
      label: "CPU",
      value: vm.cpu_count != null ? `${vm.cpu_count} CPUs` : "—",
    },
    {
      icon: (
        <IconTopologyBus className="size-5 rotate-180 text-muted-foreground" />
      ),
      label: "Memory",
      value: vm.memory_mb != null ? formatMemory(vm.memory_mb) : "—",
    },
    {
      icon: <IconDatabase className="size-5 text-muted-foreground" />,
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
              {isTemplate ? (
                <IconTemplate className="size-8" />
              ) : (
                <IconDeviceImac className="size-8" />
              )}
              <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
                {node.name}
              </h1>
            </CardTitle>
            <CardDescription>
              {isTemplate ? "Template" : "Virtual Machine"}
            </CardDescription>
            <CardAction>
              <VmOptionsMenu
                isTemplate={isTemplate}
                vmid={vm.vmid}
                pveNode={vm.node}
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 grid-rows-3 gap-4 md:grid-cols-3 md:grid-rows-2 md:gap-6 xl:grid-cols-6 xl:grid-rows-1">
              {stats.map((stat) => (
                <Item key={stat.label} variant="muted">
                  <ItemMedia>{stat.icon}</ItemMedia>
                  <ItemContent>
                    <ItemTitle>{stat.label}</ItemTitle>
                  </ItemContent>
                  <ItemFooter>
                    <Badge variant={stat.variant ?? "default"}>
                      {stat.value}
                    </Badge>
                  </ItemFooter>
                </Item>
              ))}
            </div>
          </CardContent>
        </Card>
        {!isTemplate && (
          <VncConsole
            key={vm.vmid}
            node={vm.node}
            vmid={vm.vmid}
            powerStatus={vmStatus}
          />
        )}
      </div>
    </div>
  )
}
