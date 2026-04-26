import {
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconId,
  IconPackages,
  IconPower,
  IconTemplate,
  IconTopologyBus,
} from "@tabler/icons-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Skeleton } from "@workspace/ui/components/skeleton"
import type {
  ApiTreeNode,
  ApiTreeNodeVM,
} from "@/features/inventory/types/inventory-types"
import type { VmResources } from "@/features/vms/types/vm-types"
import type { ReactNode } from "@tabler/icons-react"
import { LoadingTransition } from "@/components/loading-transition"
import { VmOptionsMenu } from "@/features/inventory/components/inventory-actions"
import {
  formatBytes,
  formatMemory,
  formatUptime,
} from "@/features/shared/utils/utils"

type Stat = {
  icon: ReactNode
  label: string
  value: string
  usage?: ResourceUsage | null
  detail?: string | null
  textStyle?: string
  bgStyle?: string
}

type ResourceUsage = {
  label: string
  value: number
}

function formatCpuCount(cpuCount: number): string {
  return `${cpuCount} CPU${cpuCount === 1 ? "" : "s"}`
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function getCpuUsage(resources: VmResources | undefined): ResourceUsage | null {
  if (!resources) return null

  return {
    label: `${(resources.cpu * 100).toFixed(1)}%`,
    value: clampProgress(resources.cpu * 100),
  }
}

function getMemoryUsage(
  resources: VmResources | undefined
): ResourceUsage | null {
  if (!resources || resources.maxmem <= 0) return null

  const usage = (resources.mem / resources.maxmem) * 100

  return {
    label: `${usage.toFixed(1)}%`,
    value: clampProgress(usage),
  }
}

function getUptimeDetail(
  isTemplate: boolean,
  powerStatus: string | undefined,
  resources: VmResources | undefined
): string | null {
  if (isTemplate || powerStatus !== "running" || resources?.uptime == null) {
    return null
  }

  return formatUptime(resources.uptime)
}

function buildStats(
  vm: ApiTreeNodeVM | null,
  isTemplate: boolean,
  powerStatus: string | undefined,
  resources: VmResources | undefined
): Array<Stat> {
  const cpuUsage = getCpuUsage(resources)
  const memoryUsage = getMemoryUsage(resources)

  return [
    {
      icon: <IconPower className="size-5 text-muted-foreground" />,
      label: "Status",
      value: isTemplate
        ? "Template"
        : powerStatus
          ? powerStatus.charAt(0).toUpperCase() + powerStatus.slice(1)
          : "—",
      textStyle: isTemplate
        ? undefined
        : powerStatus === "running"
          ? "text-green-600 dark:text-green-400"
          : powerStatus === "stopped"
            ? "text-destructive"
            : undefined,
      bgStyle: isTemplate
        ? undefined
        : powerStatus === "running"
          ? "bg-green-600/5 dark:bg-green-400/5"
          : powerStatus === "stopped"
            ? "bg-destructive/5"
            : undefined,
      detail: getUptimeDetail(isTemplate, powerStatus, resources),
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
      icon: <IconDatabase className="size-5 text-muted-foreground" />,
      label: "Storage",
      value: vm?.disk_gb != null ? `${vm.disk_gb} GB` : "—",
    },
    {
      icon: <IconCpu className="size-5 text-muted-foreground" />,
      label: "CPU",
      value:
        vm?.cpu_count != null
          ? formatCpuCount(vm.cpu_count)
          : resources?.maxcpu != null
            ? formatCpuCount(resources.maxcpu)
            : "—",
      usage: cpuUsage,
      detail: cpuUsage ? cpuUsage.label : null,
    },
    {
      icon: (
        <IconTopologyBus className="size-5 rotate-180 text-muted-foreground" />
      ),
      label: "Memory",
      value:
        vm?.memory_mb != null
          ? formatMemory(vm.memory_mb)
          : resources?.maxmem != null
            ? formatBytes(resources.maxmem)
            : "—",
      usage: memoryUsage,
      detail: memoryUsage ? memoryUsage.label : null,
    },
  ]
}

export function VmHeader({
  node,
  itemId,
  vm,
  powerStatus,
  resources,
  isTemplate,
  isLoading,
}: {
  node: ApiTreeNode | null
  itemId: string
  vm: ApiTreeNodeVM | null
  powerStatus: string | undefined
  resources: VmResources | undefined
  isTemplate: boolean
  isLoading: boolean
}) {
  const stats = buildStats(vm, isTemplate, powerStatus, resources)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isTemplate ? (
            <IconTemplate className="size-7 text-muted-foreground" />
          ) : (
            <IconDeviceDesktop className="size-7 text-muted-foreground" />
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
          {node && (
            <VmOptionsMenu
              nodeId={node.id}
              permissions={node.permissions}
              isTemplate={isTemplate}
              itemId={itemId}
              vmid={vm?.vmid}
              pveNode={vm?.node}
              name={node.name}
              isLoading={isLoading}
              powerStatus={powerStatus}
            />
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 grid-rows-3 gap-4 lg:grid-cols-3 lg:grid-rows-2 lg:gap-6 2xl:grid-cols-6 2xl:grid-rows-1">
          {stats.map((stat) => {
            const hasUsage = stat.usage != null
            return (
              <Item
                key={stat.label}
                variant="muted"
                className={`${hasUsage ? "relative overflow-hidden pr-10" : ""} ${stat.bgStyle ?? ""}`}
              >
                <ItemMedia>{stat.icon}</ItemMedia>
                <ItemContent className={hasUsage ? "w-full gap-3" : undefined}>
                  <ItemTitle className="text-muted-foreground">
                    {stat.label}
                  </ItemTitle>
                </ItemContent>
                <ItemFooter>
                  <LoadingTransition
                    isLoading={isLoading}
                    fallback={
                      <div className="space-y-2">
                        <Skeleton
                          className={`h-8 rounded-md ${hasUsage ? "w-20" : "w-16"}`}
                        />
                        <Skeleton
                          className={`h-4 rounded-md ${stat.detail ? "w-12" : "w-0 opacity-0"}`}
                        />
                      </div>
                    }
                  >
                    <div className="flex min-h-15 flex-col items-start gap-1">
                      <h3
                        className={`scroll-m-20 text-2xl font-semibold tracking-tight ${stat.textStyle}`}
                      >
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
                {stat.usage && (
                  <div className="absolute right-4 flex w-2 items-center justify-center">
                    <Progress
                      className="mt-4 w-16 shrink-0 rotate-270"
                      value={stat.usage.value}
                    />
                  </div>
                )}
              </Item>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
