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
    <Card className={cn("h-full", className)}>
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
      <CardContent className="flex flex-1 flex-col">
        <AnimatePresence initial={false} mode="wait">
          {error ? (
            <Empty key="error" className="min-h-52 border border-dashed">
              <EmptyHeader>
                <EmptyTitle>Could not load clone status</EmptyTitle>
                <EmptyDescription>{error.message}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : entry ? (
            <m.div
              key={entry.pod.slug}
              className="flex w-full flex-1 items-center"
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={animateContainer}
            >
              <m.div variants={animateTableRow} className="w-full">
                <Item
                  className="items-center shadow ring-1 ring-foreground/5"
                  render={
                    <Link
                      to="/pods/$podSlug"
                      params={{ podSlug: entry.pod.slug }}
                      aria-label={`Open ${entry.pod.title}`}
                    />
                  }
                >
                  <ItemMedia
                    variant="image"
                    className="hidden size-40 translate-y-0! self-center! md:block"
                  >
                    <Image
                      src={entry.pod.image}
                      alt={entry.pod.title}
                      width={256}
                      height={256}
                      className="rounded-3xl"
                      loading="eager"
                    />
                  </ItemMedia>

                  <ItemContent>
                    <ItemTitle className="flex justify-between lg:w-full">
                      <span className="line-clamp-1 text-2xl font-semibold tracking-tight">
                        {entry.pod.title}
                      </span>
                      <ClonedPodStatusBadge status={entry.clonedPod.status} />
                    </ItemTitle>
                    <ItemDescription>{entry.pod.description}</ItemDescription>
                    <div className="flex w-full flex-col gap-2 pt-4">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">
                          Questions answered
                        </span>
                        <span className="text-muted-foreground">
                          {entry.clonedPod.question_summary.answered} /{" "}
                          {entry.clonedPod.question_summary.total}
                        </span>
                      </div>
                      <ProgressPills
                        progress={entry.clonedPod.question_summary.progress}
                      />
                    </div>
                  </ItemContent>
                </Item>
              </m.div>
            </m.div>
          ) : (
            <Empty key="empty" className="min-h-52 border border-dashed">
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
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
