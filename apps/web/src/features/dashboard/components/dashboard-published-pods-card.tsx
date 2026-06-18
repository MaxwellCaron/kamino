import { Link } from "@tanstack/react-router"
import { IconArrowUpRight, IconCube } from "@tabler/icons-react"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import { BrowsePodsCard } from "@/features/pods/components/browse/browse-pods-card"

export function DashboardRecentPodsCard({
  className,
  error,
  pods,
  totalPods,
}: {
  className?: string
  error: Error | null
  pods: Array<PublishedPodCatalogEntry>
  totalPods: number
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
          <Button
            nativeButton={false}
            render={
              <Link
                to="/pods/browse"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                All Pods
                <IconArrowUpRight data-icon="inline-end" />
              </Link>
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent className="mx-6 h-full rounded-4xl bg-muted/50 p-6">
        {error ? (
          <Empty className="min-h-52 border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Could not load pods</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : pods.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {pods.map((pod) => (
              <BrowsePodsCard key={pod.id} pod={pod} />
            ))}
          </div>
        ) : (
          <Empty className="h-full min-h-52 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconCube />
              </EmptyMedia>
              <EmptyTitle>No published pods</EmptyTitle>
              <EmptyDescription>
                Published pods you can access will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {totalPods > pods.length && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Showing {pods.length} of {totalPods} visible pods.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
