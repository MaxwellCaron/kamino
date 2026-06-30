import { AnimatePresence, m } from "motion/react"
import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUpRight01Icon, CopyIcon } from "@hugeicons/core-free-icons"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { cn } from "@workspace/ui/lib/utils"
import { Image } from "@unpic/react"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { ProgressPills } from "@workspace/ui/components/progress-pills"
import type { ClonedPodEntry } from "../utils/dashboard-types"
import { ClonedPodStatusBadge } from "@/features/pods/components/cloned-pod-status-badge"
import { animateContainer, animateTableRow } from "@/components/animate"

export function DashboardCurrentClonedPodCard({
  className,
  entry,
  error,
}: {
  className?: string
  entry: ClonedPodEntry | null
  error: Error | null
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Cloned Pod
        </CardTitle>
        <CardDescription>Most recently cloned environment.</CardDescription>
        <CardAction>
          {entry && (
            <Link
              to="/pods/$podSlug"
              params={{ podSlug: entry.pod.slug }}
              className={buttonVariants()}
            >
              Continue
              <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" />
            </Link>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <Empty className="h-full min-h-52 border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Could not load clone status</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : entry ? (
          <AnimatePresence mode="wait">
            <m.div
              key={entry.pod.slug}
              className="flex gap-4"
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={animateContainer}
            >
              <m.div variants={animateTableRow} className="w-full">
                <Item
                  variant="muted"
                  render={
                    <Link
                      to="/pods/$podSlug"
                      params={{ podSlug: entry.pod.slug }}
                    >
                      <ItemMedia
                        variant="image"
                        className="hidden size-40 md:block"
                      >
                        <Image
                          src={entry.pod.image}
                          alt={entry.pod.title}
                          width={256}
                          height={256}
                          className="rounded-3xl"
                        />
                      </ItemMedia>

                      <ItemContent>
                        <ItemTitle className="flex justify-between lg:w-full">
                          <span className="line-clamp-1 text-2xl font-semibold tracking-tight">
                            {entry.pod.title}
                          </span>
                          <ClonedPodStatusBadge
                            status={entry.clonedPod.status}
                          />
                        </ItemTitle>
                        <ItemDescription>
                          {entry.pod.description}
                        </ItemDescription>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <HugeiconsIcon icon={CopyIcon} className="size-4" />
                          Cloned{" "}
                          <RelativeTimeCard
                            date={entry.clonedPod.cloned_at}
                            display="relative"
                            timezones={["UTC"]}
                            delay={50}
                            closeDelay={150}
                            variant="muted"
                          />
                        </span>
                        <div className="w-full pt-4">
                          <ProgressPills
                            progress={entry.clonedPod.task_summary.progress}
                          />
                        </div>
                      </ItemContent>
                    </Link>
                  }
                />
              </m.div>
            </m.div>
          </AnimatePresence>
        ) : (
          <Empty className="h-full min-h-52 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon
                  icon={CopyIcon}
                  className="text-muted-foreground"
                />
              </EmptyMedia>
              <EmptyTitle>No cloned pods</EmptyTitle>
              <EmptyDescription>
                Clone a pod from the catalog to track it here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
