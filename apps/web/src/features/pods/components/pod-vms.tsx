import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ItemGroup } from "@workspace/ui/components/item"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@workspace/ui/components/empty"
import { IconDeviceDesktop } from "@tabler/icons-react"
import type { PodVM } from "../types/pod-types"
import { VmListItem } from "@/features/vms/components/vm-list-item"

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
              <VmListItem
                key={vm.id}
                itemId={vm.inventory.itemId}
                name={vm.name}
                openInNewTab={true}
                status={vm.status}
                uptime={vm.uptime}
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
      <CardFooter className="text-muted-foreground">
        List of virtual machines that you currently have access to. Please note
        that this may not represent all the virtual machines available within
        the pod environment.
      </CardFooter>
    </Card>
  )
}
