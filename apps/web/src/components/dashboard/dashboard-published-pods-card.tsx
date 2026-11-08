import {
  ArrowUpRight01Icon,
  PackageRemoveIcon,
} from "@hugeicons/core-free-icons"
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
import { ScrollArea, ScrollBar } from "@workspace/ui/components/scroll-area"
import { BrowsePodsCard } from "@/components/pods/browse-pods-card"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link } from "@tanstack/react-router"
import type { PodCatalogSummary } from "@/lib/pods/pod-types"
import { browsePodsCarouselItemClassName } from "@/lib/pods/browse-pods-layout"
import { buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

export function DashboardRecentPodsCard({
  className,
  clonedPodIds,
  error,
  pods,
}: {
  className?: string
  clonedPodIds: Set<string>
  error: Error | null
  pods: Array<PodCatalogSummary>
}) {
  const showPublishedPodCards = pods.length > 0

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
      <CardContent className="flex flex-col gap-6">
        {error ? (
          <Empty className="h-full min-h-52">
            <EmptyHeader>
              <EmptyTitle>Could not load pods</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : showPublishedPodCards ? (
          <ScrollArea className="w-full rounded-md">
            <div className="flex w-max gap-6 pb-4">
              {pods.map((pod) => (
                <div key={pod.id} className={browsePodsCarouselItemClassName}>
                  <BrowsePodsCard
                    pod={pod}
                    hasClonedInstance={clonedPodIds.has(pod.id)}
                    animate={false}
                  />
                </div>
              ))}
            </div>
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
