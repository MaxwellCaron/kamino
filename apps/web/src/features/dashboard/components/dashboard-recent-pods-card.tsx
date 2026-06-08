import { Link } from "@tanstack/react-router"
import { IconArrowUpRight, IconBook2 } from "@tabler/icons-react"
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { cn } from "@workspace/ui/lib/utils"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"

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
            size="sm"
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
      <CardContent>
        {error ? (
          <Empty className="min-h-52 border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Could not load pods</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : pods.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {pods.map((pod) => (
              <Item
                key={pod.id}
                variant="muted"
                size="sm"
                render={
                  <Link to="/pods/$podSlug" params={{ podSlug: pod.slug }}>
                    <ItemMedia variant="image">
                      <img src={pod.image} alt={pod.title} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{pod.title}</ItemTitle>
                      <ItemDescription>
                        {pod.virtual_machines.length} VMs · {pod.clone_count}{" "}
                        clones
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <IconArrowUpRight className="size-4" />
                    </ItemActions>
                  </Link>
                }
              />
            ))}
          </div>
        ) : (
          <Empty className="min-h-52 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconBook2 />
              </EmptyMedia>
              <EmptyTitle>No visible pods</EmptyTitle>
              <EmptyDescription>
                Published pods you can access will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {totalPods > pods.length && (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {pods.length} of {totalPods} visible pods.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
