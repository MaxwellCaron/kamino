import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

export function PublishedPodsPageSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading published pods"
      className="@container/main flex flex-1 flex-col gap-2"
    >
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <Skeleton className="h-10 w-full max-w-xs rounded-md" />
            </CardTitle>
            <CardDescription className="flex flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-full max-w-2xl rounded-md" />
              <Skeleton className="h-4 w-2/3 max-w-xl rounded-md" />
            </CardDescription>
            <CardAction className="flex gap-2">
              <Skeleton className="h-10 w-24 rounded-md" />
              <Skeleton className="h-10 w-24 rounded-md" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-3.5 rounded-2xl bg-muted/50 px-4 py-3.5"
                >
                  <div className="flex items-center gap-3.5">
                    <Skeleton className="size-5 rounded-md" />
                    <Skeleton className="h-4 w-28 rounded-md" />
                  </div>
                  <Skeleton className="h-8 w-16 rounded-md" />
                  <Skeleton className="h-4 w-full max-w-xs rounded-md" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Skeleton className="h-6 w-32 rounded-md" />
            </CardTitle>
            <CardDescription>
              <Skeleton className="h-4 w-full max-w-sm rounded-md" />
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="flex items-center justify-between gap-6 px-6">
              <Skeleton className="h-10 w-full max-w-sm rounded-md" />
              <div className="flex items-center gap-2">
                <Skeleton className="hidden h-4 w-24 rounded-md lg:block" />
                <Skeleton className="h-10 w-20 rounded-md" />
              </div>
            </div>
            <div className="overflow-hidden py-6">
              <div className="border-y">
                <div className="hidden min-h-10 grid-cols-[minmax(24rem,1fr)_12rem_10rem_8rem_6rem_8rem_4rem] items-center gap-4 bg-muted px-6 text-sm lg:grid">
                  <Skeleton className="h-4 w-12 rounded-md" />
                  <Skeleton className="h-4 w-16 rounded-md" />
                  <Skeleton className="h-4 w-14 rounded-md" />
                  <Skeleton className="h-4 w-16 rounded-md" />
                  <Skeleton className="h-4 w-12 rounded-md" />
                  <Skeleton className="h-4 w-14 rounded-md" />
                  <span />
                </div>
                {Array.from({ length: 5 }, (_, index) => (
                  <PublishedPodsTableRowSkeleton key={index} />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3 px-6 pb-2 md:flex-row md:items-center md:justify-between">
              <Skeleton className="h-4 w-36 rounded-md" />
              <div className="flex items-center gap-2">
                <Skeleton className="size-9 rounded-md" />
                <Skeleton className="size-9 rounded-md" />
                <Skeleton className="h-9 w-20 rounded-md" />
                <Skeleton className="size-9 rounded-md" />
                <Skeleton className="size-9 rounded-md" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PublishedPodsTableRowSkeleton() {
  return (
    <div className="flex min-h-28 flex-col gap-4 border-b px-6 py-4 last:border-b-0 lg:grid lg:grid-cols-[minmax(24rem,1fr)_12rem_10rem_8rem_6rem_8rem_4rem] lg:items-center lg:gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <Skeleton className="size-20 shrink-0 rounded-2xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-44 max-w-full rounded-md" />
            <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-28 rounded-md" />
          <Skeleton className="h-4 w-full max-w-md rounded-md" />
          <Skeleton className="h-4 w-2/3 max-w-sm rounded-md" />
        </div>
      </div>
      <div className="flex items-center gap-2 lg:block">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-4 w-28 rounded-md" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-3.5 w-20 rounded-md" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-14 rounded-md" />
        <Skeleton className="h-4 w-16 rounded-md" />
      </div>
      <Skeleton className="h-5 w-10 rounded-md" />
      <Skeleton className="h-5 w-24 rounded-md" />
      <Skeleton className="size-8 rounded-md lg:ml-auto" />
    </div>
  )
}
