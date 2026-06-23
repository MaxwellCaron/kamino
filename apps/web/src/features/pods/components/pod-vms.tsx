import {
  Card,
  CardContent,
  CardDescription,
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
import type { ClonedPodNetwork, PodVM } from "../types/pod-types"
import { VmListItem } from "@/features/vms/components/vm-list-item"

function NetworkValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-center">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-mono text-sm break-all tabular-nums">{value}</span>
    </div>
  )
}

function PodNetworkDetails({ network }: { network: ClonedPodNetwork }) {
  return (
    <div className="grid gap-3 rounded-4xl bg-muted px-6 py-4 sm:grid-cols-3">
      <NetworkValue label="VNet" value={network.vnet} />
      <NetworkValue label="External" value={network.external_subnet} />
      {network.internal_subnet ? (
        <NetworkValue label="Internal" value={network.internal_subnet} />
      ) : null}
    </div>
  )
}

export function PodVms({
  network,
  vms,
}: {
  network?: ClonedPodNetwork
  vms: Array<PodVM>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconDeviceDesktop className="text-muted-foreground" />
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Virtual Machines
          </span>
        </CardTitle>
        <CardDescription>
          List of virtual machines that you currently have access to. Please
          note that this may not represent all the virtual machines available
          within the pod environment.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {network ? <PodNetworkDetails network={network} /> : null}
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
    </Card>
  )
}
