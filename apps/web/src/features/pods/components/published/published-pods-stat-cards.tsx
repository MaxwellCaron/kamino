import { IconCopy, IconEye, IconLock, IconBox } from "@tabler/icons-react"
import {
  Item,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

type PublishedPodsStats = {
  total: number
  listed: number
  unlisted: number
  restricted: number
  totalClones: number
}

export function PublishedPodsStatCards({
  stats,
}: {
  stats: PublishedPodsStats
}) {
  const statItems = [
    {
      icon: IconBox,
      title: "Pods",
      value: `${stats.total}`,
      description: `${stats.listed} listed and ${stats.unlisted} unlisted pods.`,
    },
    {
      icon: IconLock,
      title: "Restricted Pods",
      value: `${stats.restricted}`,
      description: "Pods limited to specific users or groups.",
    },
    {
      icon: IconCopy,
      title: "Clones",
      value: `${stats.totalClones}`,
      description: "Total clone count across the current catalog.",
    },
    {
      icon: IconEye,
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
            <stat.icon className="size-5 text-muted-foreground" />
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
