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
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  IconClock,
  IconDotsVertical,
  IconPlayerPlay,
  IconPlayerStop,
} from "@tabler/icons-react"
import type { PodVM } from "../../types/pod-types"
import { VmIcon } from "@/features/inventory/components/tree/vm-icon"
import { formatUptime } from "@/features/shared/utils/format"

export function ClonedPodVms({ vms }: { vms: Array<PodVM> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Virtual Machines</CardTitle>
        <CardDescription>
          Virtual machines that belong to this pod and their current status
        </CardDescription>
        <CardAction className="flex gap-2">
          <Button size="icon">
            <IconPlayerPlay />
          </Button>
          <Button size="icon" variant="destructive">
            <IconPlayerStop />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vms.map((vm) => (
            <Item key={vm.id} variant="muted">
              <ItemMedia variant="icon">
                <VmIcon status={vm.status} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="text-sm font-medium">{vm.name}</ItemTitle>
                <ItemDescription className="flex items-center gap-1.5">
                  <span>
                    {vm.status.charAt(0).toUpperCase() + vm.status.slice(1)}
                  </span>
                  {vm.uptime && (
                    <Badge variant="outline">
                      <IconClock />
                      {formatUptime(vm.uptime)}
                    </Badge>
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
      </CardContent>
    </Card>
  )
}
