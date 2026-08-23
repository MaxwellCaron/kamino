import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PackageAddIcon,
  PackageCheck,
  RouterIcon,
} from "@hugeicons/core-free-icons"
import { Button, buttonVariants } from "@workspace/ui/components/button"
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
  onCloneRouter,
}: {
  stats: PublishedPodsStats
  onCloneRouter: () => void
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
        <CardAction className="flex flex-wrap justify-end gap-2">
          <Link
            to="/pods/create"
            className={`${buttonVariants({ variant: "outline" })} cursor-pointer`}
          >
            <HugeiconsIcon icon={PackageAddIcon} data-icon="inline-start" />
            Create
          </Link>
          <Link
            to="/pods/publish"
            className={`${buttonVariants({ variant: "outline" })} cursor-pointer`}
          >
            <HugeiconsIcon icon={PackageCheck} data-icon="inline-start" />
            Publish
          </Link>
          <Button type="button" onClick={onCloneRouter}>
            <HugeiconsIcon icon={RouterIcon} data-icon="inline-start" />
            Clone Router
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <PublishedPodsStatCards stats={stats} />
      </CardContent>
    </Card>
  )
}
