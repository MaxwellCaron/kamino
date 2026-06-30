import { m } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ComputerIcon,
  Copy02Icon,
  CpuIcon,
  Globe02Icon,
  HardDriveIcon,
  IdentityCardIcon,
  PowerIcon,
  RamMemoryIcon,
} from "@hugeicons/core-free-icons"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import type {
  ApiTreeNode,
  ApiTreeNodeVM,
} from "@/features/inventory/types/inventory-types"
import type {
  ApiVmNetworkSummary,
  VmResources,
} from "@/features/vms/types/vm-types"
import type { ReactNode } from "react"
import { VmOptionsMenu } from "@/features/inventory/components/inventory-actions"
import {
  formatBytes,
  formatMemory,
  formatUptime,
} from "@/features/shared/utils/format"
import {
  formatVmPowerStatus,
  getVmPowerStatusSurfaceClassName,
  getVmPowerStatusTextClassName,
} from "@/components/status/vm-icon"
import { animateChild, animateContainer } from "@/components/animate"

type Stat = {
  icon: ReactNode
  label: string
  value: string
  usage?: ResourceUsage | null
  detail?: string | null
  textStyle?: string
  bgStyle?: string
  content?: ReactNode
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

function NetworkingStatContent({
  networks,
  isLoading,
  isError,
}: {
  networks: Array<ApiVmNetworkSummary> | undefined
  isLoading: boolean
  isError: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex min-h-15 w-full flex-col justify-between gap-1.5">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex min-h-15 w-full flex-col justify-center">
        <p className="text-sm text-muted-foreground">Unavailable</p>
      </div>
    )
  }

  if (!networks || networks.length === 0) {
    return (
      <div className="flex min-h-15 w-full flex-col justify-center">
        <p className="text-sm text-muted-foreground">No interfaces</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-15 w-full flex-col justify-between">
      {networks.map((network, index) => (
        <div
          key={`${network.device ?? index}-${network.bridge}`}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="text-xl font-semibold tracking-tight">
            {network.device ?? `net${index}`}
          </span>
          <span className="min-w-0 truncate text-xl font-semibold tracking-tight text-muted-foreground">
            {network.bridge}
          </span>
        </div>
      ))}
    </div>
  )
}

function buildStats(
  vm: ApiTreeNodeVM,
  isTemplate: boolean,
  powerStatus: string | undefined,
  resources: VmResources | undefined,
  networks: Array<ApiVmNetworkSummary> | undefined,
  isNetworksLoading: boolean,
  isNetworksError: boolean
): Array<Stat> {
  const cpuUsage = getCpuUsage(resources)
  const memoryUsage = getMemoryUsage(resources)

  return [
    {
      icon: (
        <HugeiconsIcon
          icon={PowerIcon}
          className="size-5 text-muted-foreground"
        />
      ),
      label: "Status",
      value: isTemplate ? "Template" : formatVmPowerStatus(powerStatus),
      textStyle: isTemplate
        ? undefined
        : getVmPowerStatusTextClassName(powerStatus),
      bgStyle: isTemplate
        ? undefined
        : getVmPowerStatusSurfaceClassName(powerStatus),
      detail: getUptimeDetail(isTemplate, powerStatus, resources),
    },
    {
      icon: (
        <HugeiconsIcon
          icon={IdentityCardIcon}
          className="size-5 text-muted-foreground"
        />
      ),
      label: "Node / VMID",
      value: `${vm.node} / ${vm.vmid}`,
    },
    {
      icon: (
        <HugeiconsIcon
          icon={HardDriveIcon}
          className="size-5 text-muted-foreground"
        />
      ),
      label: "Storage",
      value: vm.disk_gb != null ? `${vm.disk_gb} GB` : "—",
    },
    {
      icon: (
        <HugeiconsIcon
          icon={CpuIcon}
          className="size-5 text-muted-foreground"
        />
      ),
      label: "CPU",
      value:
        vm.cpu_count != null
          ? formatCpuCount(vm.cpu_count)
          : resources?.maxcpu != null
            ? formatCpuCount(resources.maxcpu)
            : "—",
      usage: cpuUsage,
      detail: cpuUsage ? cpuUsage.label : null,
    },
    {
      icon: (
        <HugeiconsIcon
          icon={RamMemoryIcon}
          className="size-5 text-muted-foreground"
        />
      ),
      label: "Memory",
      value:
        vm.memory_mb != null
          ? formatMemory(vm.memory_mb)
          : resources?.maxmem != null
            ? formatBytes(resources.maxmem)
            : "—",
      usage: memoryUsage,
      detail: memoryUsage ? memoryUsage.label : null,
    },
    {
      icon: (
        <HugeiconsIcon
          icon={Globe02Icon}
          className="size-5 text-muted-foreground"
        />
      ),
      label: "Networking",
      value: "",
      content: (
        <NetworkingStatContent
          networks={networks}
          isLoading={isNetworksLoading}
          isError={isNetworksError}
        />
      ),
    },
  ]
}

export function VmHeader({
  node,
  itemId,
  vm,
  powerStatus,
  resources,
  networks,
  isNetworksLoading,
  isNetworksError,
  isTemplate,
}: {
  node: ApiTreeNode
  itemId: string
  vm: ApiTreeNodeVM
  powerStatus: string | undefined
  resources: VmResources | undefined
  networks: Array<ApiVmNetworkSummary> | undefined
  isNetworksLoading: boolean
  isNetworksError: boolean
  isTemplate: boolean
}) {
  const stats = buildStats(
    vm,
    isTemplate,
    powerStatus,
    resources,
    networks,
    isNetworksLoading,
    isNetworksError
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isTemplate ? (
            <HugeiconsIcon
              icon={Copy02Icon}
              className="size-7 text-muted-foreground"
            />
          ) : (
            <HugeiconsIcon
              icon={ComputerIcon}
              className="size-7 text-muted-foreground"
            />
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
            nodeId={node.id}
            permissions={node.permissions}
            isTemplate={isTemplate}
            itemId={itemId}
            vmid={vm.vmid}
            pveNode={vm.node}
            name={node.name}
            powerStatus={powerStatus}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <m.div
          key={itemId}
          initial="hidden"
          animate="show"
          variants={animateContainer}
          className="grid grid-cols-2 grid-rows-3 gap-4 lg:grid-cols-3 lg:grid-rows-2 lg:gap-6 2xl:grid-cols-6 2xl:grid-rows-1"
        >
          {stats.map((stat) => {
            const hasUsage = stat.usage != null
            return (
              <m.div key={stat.label} variants={animateChild}>
                <Item
                  variant="muted"
                  className={`${hasUsage ? "relative overflow-hidden pr-10" : ""} ${stat.bgStyle ?? ""}`}
                >
                  <ItemMedia>{stat.icon}</ItemMedia>
                  <ItemContent
                    className={hasUsage ? "w-full gap-3" : undefined}
                  >
                    <ItemTitle className="text-muted-foreground">
                      {stat.label}
                    </ItemTitle>
                  </ItemContent>
                  <ItemFooter>
                    {stat.content ?? (
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
                    )}
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
              </m.div>
            )
          })}
        </m.div>
      </CardContent>
    </Card>
  )
}
