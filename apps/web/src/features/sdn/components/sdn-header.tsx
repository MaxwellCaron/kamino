import { m } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Globe02Icon,
  GroupIcon,
  RouterIcon,
  Wifi02Icon,
} from "@hugeicons/core-free-icons"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Item, ItemMedia, ItemTitle } from "@workspace/ui/components/item"
import type { ReactNode } from "react"
import type { IconSvgElement } from "@hugeicons/react"
import { animateChild, animateContainer } from "@/components/animate"

type SdnStat = {
  icon: ReactNode
  label: string
  value: string
  detail: string
}

function statIcon(icon: IconSvgElement) {
  return <HugeiconsIcon icon={icon} className="size-5 text-muted-foreground" />
}

function statValue(value: number | null) {
  return value === null ? "—" : String(value)
}

function buildSdnStats({
  zoneCount,
  vnetCount,
  vlanAwareCount,
  cloneTargetCount,
}: SdnHeaderProps): Array<SdnStat> {
  return [
    {
      icon: statIcon(GroupIcon),
      label: "Zones",
      value: statValue(zoneCount),
      detail: "SDN zones backing the VNets available to Kamino.",
    },
    {
      icon: statIcon(Globe02Icon),
      label: "VNets",
      value: statValue(vnetCount),
      detail: "Virtual networks defined in the Proxmox SDN configuration.",
    },
    {
      icon: statIcon(Wifi02Icon),
      label: "VLAN Aware",
      value: statValue(vlanAwareCount),
      detail: "VNets that can carry the inner VLAN tag a pod network needs.",
    },
    {
      icon: statIcon(RouterIcon),
      label: "Clone Targets",
      value: statValue(cloneTargetCount),
      detail: "Subnet and bridge domains that pods can be cloned onto.",
    },
  ]
}

type SdnHeaderProps = {
  zoneCount: number | null
  vnetCount: number | null
  vlanAwareCount: number | null
  cloneTargetCount: number | null
}

export function SdnHeader(props: SdnHeaderProps) {
  const stats = buildSdnStats(props)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-4xl font-extrabold tracking-tight text-balance">
          SDN
        </CardTitle>
        <CardDescription>
          Proxmox software-defined networking, and the clone targets that place
          pods onto it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <m.div
          className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6"
          initial="hidden"
          animate="show"
          variants={animateContainer}
        >
          {stats.map((stat) => (
            <m.div key={stat.label} variants={animateChild}>
              <Item
                variant="muted"
                className="relative h-full flex-col items-start overflow-hidden"
              >
                <div className="flex items-center gap-3.5">
                  <ItemMedia>{stat.icon}</ItemMedia>
                  <ItemTitle className="text-muted-foreground">
                    {stat.label}
                  </ItemTitle>
                </div>
                <div className="flex min-h-15 flex-col items-start gap-1">
                  <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
                    {stat.value}
                  </h3>
                  <div className="min-h-5">
                    <p className="text-sm text-muted-foreground">
                      {stat.detail}
                    </p>
                  </div>
                </div>
              </Item>
            </m.div>
          ))}
        </m.div>
      </CardContent>
    </Card>
  )
}
