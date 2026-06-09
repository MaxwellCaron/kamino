import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  ContributionGraph,
  ContributionGraphBlock,
  ContributionGraphCalendar,
  ContributionGraphFooter,
  ContributionGraphLegend,
  ContributionGraphTotalCount,
} from "@workspace/ui/components/kibo-ui/contribution-graph"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import type { Activity } from "@workspace/ui/components/kibo-ui/contribution-graph"

export function DashboardQuestionActivityCard({
  className,
  data,
  error,
}: {
  className?: string
  data: Array<Activity>
  error: Error | null
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="scroll-m-20 text-2xl font-semibold tracking-tight">
          Question Activity
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Task questions answered by day.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        {error ? (
          <Empty className="min-h-48 border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Could not load question activity</EmptyTitle>
              <EmptyDescription>{error.message}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ContributionGraph
            data={data}
            blockMargin={2}
            blockSize={20}
            fontSize={16}
            labels={{
              totalCount: "{{count}} questions answered in {{year}}",
              legend: {
                less: "Fewer",
                more: "More",
              },
            }}
          >
            <ContributionGraphCalendar className="pb-2">
              {({ activity, dayIndex, weekIndex }) => (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <ContributionGraphBlock
                        activity={activity}
                        dayIndex={dayIndex}
                        weekIndex={weekIndex}
                        className="transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      />
                    }
                  />
                  <TooltipContent>
                    {formatQuestionActivityTooltip(activity)}
                  </TooltipContent>
                </Tooltip>
              )}
            </ContributionGraphCalendar>
            <ContributionGraphFooter className="items-center text-xs">
              <ContributionGraphTotalCount>
                {({ totalCount }) =>
                  `${totalCount} ${totalCount === 1 ? "question" : "questions"} answered in the last 6 months`
                }
              </ContributionGraphTotalCount>
              <ContributionGraphLegend />
            </ContributionGraphFooter>
          </ContributionGraph>
        )}
      </CardContent>
    </Card>
  )
}

function formatQuestionActivityTooltip(activity: Activity) {
  const date = new Date(`${activity.date}T00:00:00`)
  const formattedDate = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })

  if (activity.count === 0) {
    return `No questions answered on ${formattedDate}`
  }

  return `${activity.count} ${activity.count === 1 ? "question" : "questions"} answered on ${formattedDate}`
}
