import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  PageSkeleton,
  SummaryCardSkeleton,
  TableBlockSkeleton,
} from "@/components/loading-skeletons"

export function RequestsPageSkeleton() {
  return (
    <PageSkeleton label="Loading requests">
      <SummaryCardSkeleton statCount={5} titleWidth="w-48" />
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="sr-only">Loading requests table</span>
          </CardTitle>
          <CardDescription>
            <span className="sr-only">Loading request queue data</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <TableBlockSkeleton rows={5} />
        </CardContent>
      </Card>
    </PageSkeleton>
  )
}
