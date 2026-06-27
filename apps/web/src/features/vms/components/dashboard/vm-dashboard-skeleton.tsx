import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

export function VmDashboardSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading virtual machine"
      className="@container/main flex flex-1 flex-col gap-2"
    >
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-10 w-64 max-w-full rounded-md" />
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-4 w-32 rounded-md" />
            </CardDescription>
            <CardAction>
              <Skeleton className="size-10 rounded-md" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid grid-cols-2 grid-rows-3 gap-4 lg:grid-cols-3 lg:grid-rows-2 lg:gap-6 2xl:grid-cols-6 2xl:grid-rows-1">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="flex min-h-28 flex-wrap items-center rounded-2xl bg-muted/50 px-4 py-3.5"
                >
                  <Skeleton className="size-5 shrink-0 rounded-md" />
                  <div className="ml-3.5 flex flex-1 flex-col gap-3">
                    <Skeleton className="h-4 w-16 rounded-md" />
                    <Skeleton className="h-7 w-20 rounded-md" />
                    <Skeleton className="h-4 w-12 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-md" />
                <Skeleton className="h-5 w-32 rounded-md" />
              </CardTitle>
            </CardHeader>
            <CardContent className="h-full">
              <div className="grid h-full grid-cols-2 grid-rows-2 gap-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="min-h-14 rounded-md" />
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Skeleton className="h-4 w-full max-w-56 rounded-md" />
            </CardFooter>
          </Card>

          <Card className="h-full lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Skeleton className="size-4 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-md" />
              </CardTitle>
              <CardAction>
                <Skeleton className="size-8 rounded-md" />
              </CardAction>
            </CardHeader>
            <CardContent className="mx-4 -mt-4 h-full rounded-4xl bg-muted/50 py-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full rounded-md" />
                <Skeleton className="h-4 w-5/6 rounded-md" />
                <Skeleton className="h-4 w-2/3 rounded-md" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
