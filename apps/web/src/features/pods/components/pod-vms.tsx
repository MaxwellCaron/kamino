import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Badge } from "@workspace/ui/components/badge"
import { ItemGroup } from "@workspace/ui/components/item"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@workspace/ui/components/empty"
import { IconDeviceDesktop } from "@tabler/icons-react"
import type { ClonedPodNetwork, PodVM } from "../types/pod-types"
import { VmListItem } from "@/features/vms/components/vm-list-item"

function NetworkValue({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-mono text-sm break-all tabular-nums">{value}</span>
      {detail ? (
        <span className="font-mono text-xs break-all text-muted-foreground tabular-nums">
          {detail}
        </span>
      ) : null}
    </div>
  )
}

function PodNetworkDetails({ network }: { network: ClonedPodNetwork }) {
  return (
    <div className="grid gap-3 border-y border-border/60 py-3 sm:grid-cols-3">
      <NetworkValue label="VNet" value={network.vnet} />
      <NetworkValue
        detail={`Gateway ${network.external_gateway}`}
        label="External"
        value={network.external_subnet}
      />
      {network.internal_subnet ? (
        <NetworkValue
          detail={
            network.internal_gateway
              ? `Gateway ${network.internal_gateway}`
              : undefined
          }
          label="Internal"
          value={network.internal_subnet}
        />
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <IconDeviceDesktop className="text-muted-foreground" />
            <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
              Virtual Machines
            </span>
          </CardTitle>
          {network ? (
            <Badge variant="outline" className="w-fit tabular-nums">
              Network {network.number}
            </Badge>
          ) : null}
        </div>
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
      <CardFooter className="text-muted-foreground">
        List of virtual machines that you currently have access to. Please note
        that this may not represent all the virtual machines available within
        the pod environment.
      </CardFooter>
    </Card>
  )
}
