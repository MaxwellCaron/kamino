import {
  PackageIcon,
  Copy01Icon,
  LockedIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Item,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import type { PublishedPodsStats } from "../../types/published-pods-types"

export function PublishedPodsStatCards({
  stats,
}: {
  stats: PublishedPodsStats
}) {
  const statItems = [
    {
      icon: PackageIcon,
      title: "Pods",
      value: `${stats.total}`,
      description: `${stats.listed} listed and ${stats.unlisted} unlisted pods.`,
    },
    {
      icon: LockedIcon,
      title: "Restricted Pods",
      value: `${stats.restricted}`,
      description: "Pods limited to specific users or groups.",
    },
    {
      icon: Copy01Icon,
      title: "Clones",
      value: `${stats.totalClones}`,
      description: "Total clone count across the current catalog.",
    },
    {
      icon: ViewIcon,
      title: "Visibility",
      value: `${stats.listed}/${stats.total}`,
      description: "Pods currently visible in the public browse catalog.",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {statItems.map((stat) => (
        <Item key={stat.title} variant="muted">
          <ItemMedia>
            <HugeiconsIcon
              icon={stat.icon}
              className="size-5 text-muted-foreground"
            />
          </ItemMedia>
          <ItemTitle className="text-muted-foreground">{stat.title}</ItemTitle>
          <ItemFooter className="flex justify-start">
            <span className="text-2xl font-semibold tracking-tight">
              {stat.value}
            </span>
          </ItemFooter>
          <span className="text-muted-foreground">{stat.description}</span>
        </Item>
      ))}
    </div>
  )
}
