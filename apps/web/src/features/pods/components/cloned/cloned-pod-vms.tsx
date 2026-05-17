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
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Button } from "@workspace/ui/components/button"
import {
  IconClock,
  IconDeviceDesktop,
  IconDotsVertical,
  IconEyeX,
} from "@tabler/icons-react"
import { cn } from "@workspace/ui/lib/utils"
import type { PodVM } from "../../types/pod-types"
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
    return "text-foreground"
  }

  return "text-amber-600 dark:text-amber-400"
}

export function ClonedPodVms({
  vms,
  vmsVisible,
}: {
  vms: Array<PodVM>
  vmsVisible?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Virtual Machines
        </CardTitle>
        <CardDescription>
          Virtual machines that belong to this pod and their current status
        </CardDescription>
        <CardAction>
          <IconDeviceDesktop className="text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent>
        {vmsVisible ? (
          <ItemGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vms.map((vm) => (
              <Item key={vm.id} variant="muted">
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground"
                  >
                    <IconDotsVertical />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconEyeX />
              </EmptyMedia>
              <EmptyTitle>Invalid Permissions</EmptyTitle>
              <EmptyDescription>
                The pod creator has disabled the ability to view virtual
                machines.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
