import {
  IconCpu,
  IconDatabase,
  IconDeviceImac,
  IconDots,
  IconId,
  IconPackages,
  IconTopologyBus,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { VncConsole } from "@/components/vnc-console"
import { PROXMOX_CONFIG } from "@/lib/proxmox-config"

export const Route = createFileRoute("/_dashboard/vnc")({
  loader: () => ({
    vmid: PROXMOX_CONFIG.vmid,
    nodeName: PROXMOX_CONFIG.nodeName,
  }),
  component: VncPage,
})

function VncPage() {
  const { vmid, nodeName } = Route.useLoaderData()

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconDeviceImac className="size-5" />
              Kali
            </CardTitle>
            <CardDescription>Virtual Machine</CardDescription>
            <CardAction>
              <Button variant="ghost" size="icon-lg">
                <IconDots />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-4 md:gap-6">
              <Item variant="muted">
                <ItemMedia>
                  <IconPackages className="size-5" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Node</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Badge>{nodeName}</Badge>
                </ItemActions>
              </Item>
              <Item variant="muted">
                <ItemMedia>
                  <IconId className="size-5" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>VMID</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Badge>{vmid}</Badge>
                </ItemActions>
              </Item>
              <Item variant="muted">
                <ItemMedia>
                  <IconCpu className="size-5" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>CPU</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Badge>2 CPUs</Badge>
                </ItemActions>
              </Item>
              <Item variant="muted">
                <ItemMedia>
                  <IconTopologyBus className="size-5 rotate-180" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Memory</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Badge>4 GB</Badge>
                </ItemActions>
              </Item>
              <Item variant="muted">
                <ItemMedia>
                  <IconDatabase className="size-5" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Storage</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <Badge>50 GB</Badge>
                </ItemActions>
              </Item>
            </div>
          </CardContent>
        </Card>
        <VncConsole node={nodeName} vmid={vmid} />
      </div>
    </div>
  )
}
