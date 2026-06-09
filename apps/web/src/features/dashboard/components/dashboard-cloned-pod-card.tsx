import { Link } from "@tanstack/react-router"
import { IconArrowRight, IconCopy } from "@tabler/icons-react"
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
import { Progress } from "@workspace/ui/components/progress"
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
import { Field, FieldLabel } from "@workspace/ui/components/field"
import type { ClonedPodEntry } from "./dashboard-home-types"

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
            <Button
              nativeButton={false}
              render={
                <Link to="/pods/$podSlug" params={{ podSlug: entry.pod.slug }}>
                  Continue
                  <IconArrowRight data-icon="inline-end" />
                </Link>
              }
            />
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {error ? (
          <Empty className="min-h-52 border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Could not load clone status</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : entry ? (
          <div className="flex gap-4">
            <Item
              variant="muted"
              render={
                <Link to="/pods/$podSlug" params={{ podSlug: entry.pod.slug }}>
                  <ItemMedia variant="image" className="size-40">
                    <Image
                      src={entry.pod.image}
                      alt={entry.pod.title}
                      width={256}
                      height={256}
                      className="rounded-3xl"
                    />
                  </ItemMedia>

                  <ItemContent>
                    <ItemTitle className="line-clamp-1 text-2xl font-semibold tracking-tight">
                      {entry.pod.title}
                    </ItemTitle>
                    <ItemDescription>{entry.pod.description}</ItemDescription>
                    <span className="text-muted-foreground">
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
                    <div className="sm:pt-6">
                      <Field className="w-full">
                        <FieldLabel htmlFor="task-progress">
                          <span className="hidden sm:block">Task progress</span>
                          <span className="ml-auto hidden sm:block">
                            {entry.clonedPod.task_summary.completed}/
                            {entry.clonedPod.task_summary.total} Tasks Completed
                          </span>
                        </FieldLabel>
                        <Progress
                          id="task-progress"
                          value={entry.clonedPod.task_summary.progress}
                          aria-label="Task progress"
                        />
                      </Field>
                    </div>
                  </ItemContent>
                </Link>
              }
            />
          </div>
        ) : (
          <Empty className="min-h-52 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconCopy />
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
