import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@workspace/ui/components/empty"
import {
  IconClock,
  IconDeviceDesktop,
  IconExternalLink,
} from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import type { PodVM } from "../types/pod-types"
import { VmIcon } from "@/features/inventory/components/tree/vm-icon"
import { formatUptime } from "@/features/shared/utils/format"

function formatStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function getStatusTextClass(status: string) {
  if (status === "running") {
    return "text-green-600 dark:text-green-400"
  }

  if (status === "stopped") {
    return "text-destructive"
  }

  return "text-amber-600 dark:text-amber-400"
}

export function PodVms({ vms }: { vms: Array<PodVM> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconDeviceDesktop className="text-muted-foreground" />
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Virtual Machines
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {vms.length > 0 ? (
          <ItemGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vms.map((vm) => (
              <Item
                key={vm.id}
                variant="muted"
                className="cursor-pointer"
                render={
                  <Link
                    to="/inventory/items/$itemId"
                    target="_blank"
                    rel="noreferrer"
                    params={{ itemId: vm.inventory.itemId }}
                  >
                    <ItemMedia variant="icon">
                      <VmIcon status={vm.status} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle className="text-sm font-medium">
                        {vm.name}
                      </ItemTitle>
                      <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={cn(
                            "font-medium",
                            getStatusTextClass(vm.status)
                          )}
                        >
                          {formatStatusLabel(vm.status)}
                        </span>
                        {vm.status === "running" && vm.uptime != null && (
                          <>
                            <span aria-hidden="true">•</span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <IconClock className="size-3.5" />
                              {formatUptime(vm.uptime)}
                            </span>
                          </>
                        )}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <IconExternalLink className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </Link>
                }
              />
            ))}
          </ItemGroup>
        ) : (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyDescription>
                No virtual machines are available.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
