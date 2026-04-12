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
import { Skeleton } from "@workspace/ui/components/skeleton"
import type { ReactNode } from "@tabler/icons-react"
import type { ApiTreeNode, ApiTreeNodeVM } from "@/lib/queries"
import { LoadingTransition } from "@/components/loading-transition"
import { VmOptionsMenu } from "@/components/inventory/inventory-actions"
import { formatMemory } from "@/lib/utils"

function buildStats(
  vm: ApiTreeNodeVM | null,
  isTemplate: boolean,
  powerStatus: string | undefined
): Array<{
  icon: ReactNode
  label: string
  value: string
  variant?: "default" | "secondary" | "destructive" | "outline"
}> {
  return [
    {
      icon: <IconPower className="size-5 text-muted-foreground" />,
      label: "Status",
      value: isTemplate
        ? "Template"
        : powerStatus
          ? powerStatus.charAt(0).toUpperCase() + powerStatus.slice(1)
          : "—",
      variant: isTemplate
        ? "secondary"
        : powerStatus === "running"
          ? "default"
          : powerStatus === "stopped"
            ? "destructive"
            : "secondary",
    },
    {
      icon: <IconPackages className="size-5 text-muted-foreground" />,
      label: "Node",
      value: vm?.node ?? "—",
    },
    {
      icon: <IconId className="size-5 text-muted-foreground" />,
      label: "VMID",
      value: vm ? String(vm.vmid) : "—",
    },
    {
      icon: <IconCpu className="size-5 text-muted-foreground" />,
      label: "CPU",
      value: vm?.cpu_count != null ? `${vm.cpu_count} CPUs` : "—",
    },
    {
      icon: (
        <IconTopologyBus className="size-5 rotate-180 text-muted-foreground" />
      ),
      label: "Memory",
      value: vm?.memory_mb != null ? formatMemory(vm.memory_mb) : "—",
    },
    {
      icon: <IconDatabase className="size-5 text-muted-foreground" />,
      label: "Storage",
      value: vm?.disk_gb != null ? `${vm.disk_gb} GB` : "—",
    },
  ]
}

export function VmHeader({
  node,
  vm,
  powerStatus,
  isTemplate,
  isLoading,
}: {
  node: ApiTreeNode | null
  vm: ApiTreeNodeVM | null
  powerStatus: string | undefined
  isTemplate: boolean
  isLoading: boolean
}) {
  const stats = buildStats(vm, isTemplate, powerStatus)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isTemplate ? (
            <IconTemplate className="size-8" />
          ) : (
            <IconDeviceImac className="size-8" />
          )}
          <LoadingTransition
            isLoading={isLoading}
            fallback={<Skeleton className="h-10 w-48 rounded-md" />}
          >
            <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
              {node?.name ?? "—"}
            </h1>
          </LoadingTransition>
        </CardTitle>
        <CardDescription>
          {isTemplate ? "Template" : "Virtual Machine"}
        </CardDescription>
        <CardAction>
          <VmOptionsMenu
            nodeId={node?.id ?? ""}
            isTemplate={isTemplate}
            vmid={vm?.vmid}
            pveNode={vm?.node}
            name={node?.name}
            isLoading={isLoading}
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
                <ItemFooter>
                  <LoadingTransition
                    isLoading={isLoading}
                    fallback={<Skeleton className="h-5 w-16 rounded-md" />}
                  >
                    <Badge variant={stat.variant ?? "default"}>
                      {stat.value}
                    </Badge>
                  </LoadingTransition>
                </ItemFooter>
              </ItemFooter>
            </Item>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
