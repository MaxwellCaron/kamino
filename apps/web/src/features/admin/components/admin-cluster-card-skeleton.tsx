import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

export function AdminClusterCardSkeleton() {
  return (
    <Card
      aria-busy="true"
      aria-label="Loading cluster"
      className="pb-0.5 xl:col-span-12"
    >
      <CardHeader>
        <CardTitle>
          <span className="scroll-m-20 text-2xl font-semibold tracking-tight">
            Cluster
          </span>
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Aggregate usage across managed Proxmox nodes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 py-3 lg:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index} className="bg-muted/50 ring-0">
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-16 rounded-md" />
                <Skeleton className="h-8 w-24 rounded-md" />
                <Skeleton className="h-40 w-full rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="-mx-6 mt-6 space-y-4 border-t px-6 pt-6">
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
        </div>
      </CardContent>
    </Card>
  )
}
