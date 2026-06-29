import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { PageSkeleton } from "@/components/loading-skeletons"

const REQUEST_STATUS_IDS = [
  "pending",
  "approved",
  "denied",
  "executed",
  "failed",
] as const

export function RequestsPageSkeleton() {
  return (
    <PageSkeleton label="Loading requests">
      <Card className="overflow-hidden border-border/70 bg-linear-to-br from-card via-card to-muted/50">
        <CardHeader className="gap-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-2xl flex-col gap-3">
              <CardTitle className="flex items-center gap-2">
                <Skeleton className="size-7 rounded-md" />
                <Skeleton className="h-10 w-36 rounded-md" />
              </CardTitle>
              <CardDescription>
                <Skeleton className="h-4 w-full max-w-xl rounded-md" />
              </CardDescription>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="col-span-3 grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-3 lg:gap-6">
              {REQUEST_STATUS_IDS.map((status) => (
                <div
                  key={status}
                  className={cn(
                    "flex flex-col gap-3.5 rounded-2xl bg-muted/50 px-4 py-3.5",
                    status === "pending" && "col-span-2"
                  )}
                >
                  <div className="flex items-center gap-3.5">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="h-4 w-24 rounded-md" />
                  </div>
                  <Skeleton className="h-8 w-12 rounded-md" />
                </div>
              ))}
            </div>
            <div className="col-span-3 lg:col-span-1">
              <Card className="h-full bg-muted/50 shadow-none ring-0">
                <CardContent className="flex h-full items-center justify-center">
                  <Skeleton className="size-32 rounded-full" />
                </CardContent>
              </Card>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <Skeleton className="size-5 rounded-md" />
                <Skeleton className="h-5 w-24 rounded-md" />
              </CardTitle>
              <CardDescription>
                <Skeleton className="h-4 w-full max-w-md rounded-md" />
              </CardDescription>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 lg:w-auto">
              <Skeleton className="h-9 rounded-md lg:w-28" />
              <Skeleton className="h-9 rounded-md lg:w-32" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="flex items-center justify-between gap-6 px-6">
            <Skeleton className="h-10 w-full max-w-sm rounded-md" />
            <Skeleton className="h-10 w-20 rounded-md" />
          </div>
          <div className="overflow-hidden py-6">
            <div className="border-y">
              {Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  className="flex min-h-16 items-center gap-4 border-b px-6 py-4 last:border-b-0"
                >
                  <Skeleton className="size-5 rounded-md" />
                  <Skeleton className="h-5 w-full max-w-sm rounded-md" />
                  <Skeleton className="ml-auto h-5 w-24 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </PageSkeleton>
  )
}
