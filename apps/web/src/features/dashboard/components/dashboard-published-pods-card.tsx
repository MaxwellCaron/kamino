import { m } from "motion/react"
import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUpRight01Icon,
  PackageRemoveIcon,
} from "@hugeicons/core-free-icons"
import { buttonVariants } from "@workspace/ui/components/button"
import { ScrollArea, ScrollBar } from "@workspace/ui/components/scroll-area"
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
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import { BrowsePodsCard } from "@/features/pods/components/browse/browse-pods-card"
import { animateChild, animateContainer } from "@/components/animate"

export function DashboardRecentPodsCard({
  className,
  error,
  pods,
}: {
  className?: string
  error: Error | null
  pods: Array<PublishedPodCatalogEntry>
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Published Pods
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Newest catalog entries visible to you.
        </CardDescription>
        <CardAction>
          <Link to="/pods" className={buttonVariants()}>
            All Pods
            <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="mx-6 h-full rounded-4xl bg-muted/50 p-6">
        {error ? (
          <Empty className="h-full min-h-52">
            <EmptyHeader>
              <EmptyTitle>Could not load pods</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : pods.length > 0 ? (
          <ScrollArea className="w-full **:scroll-fade-x">
            <m.div
              className="flex w-max space-x-4 p-4"
              initial="hidden"
              animate="show"
              variants={animateContainer}
            >
              {pods.map((pod) => (
                <m.div
                  key={pod.id}
                  variants={animateChild}
                  className="max-w-100"
                >
                  <BrowsePodsCard pod={pod} />
                </m.div>
              ))}
            </m.div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        ) : (
          <Empty className="h-full min-h-52">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon
                  icon={PackageRemoveIcon}
                  className="text-muted-foreground"
                />
              </EmptyMedia>
              <EmptyTitle>No published pods</EmptyTitle>
              <EmptyDescription>
                Published pods you can access will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}
