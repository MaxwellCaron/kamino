import { Link } from "@tanstack/react-router"
import { IconCubePlus, IconCubeSend } from "@tabler/icons-react"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { PublishedPodsStatCards } from "./published-pods-stat-cards"
import type { PublishedPodsStats } from "../../types/published-pods-types"

export function PublishedPodsHeaderCard({
  stats,
}: {
  stats: PublishedPodsStats
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-4xl font-extrabold tracking-tight text-balance">
          Published Pods
        </CardTitle>
        <CardDescription>
          Review catalog metadata, flip visibility between listed and unlisted,
          and jump straight into the publish workflow for editing.
        </CardDescription>
        <CardAction className="flex gap-2">
          <Link
            to="/pods/create"
            className={`${buttonVariants({ variant: "outline" })} cursor-pointer`}
          >
            <IconCubePlus data-icon="inline-start" />
            Create
          </Link>
          <Link
            to="/pods/publish"
            className={`${buttonVariants({ variant: "default" })} cursor-pointer`}
          >
            <IconCubeSend data-icon="inline-start" />
            Publish
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <PublishedPodsStatCards stats={stats} />
      </CardContent>
    </Card>
  )
}
