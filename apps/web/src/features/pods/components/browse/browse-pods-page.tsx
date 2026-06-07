import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { BrowsePodsCard } from "./browse-pods-card"
import { GrainientBackground } from "@/components/grainient-background"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"

export function BrowsePodsPage() {
  const catalogQuery = useQuery(podCatalogQueryOptions)
  const visiblePods = catalogQuery.data ?? []

  return (
    <div className="@container/main flex flex-1 flex-col">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 mb-1 overflow-hidden rounded-b-[40px] shadow ring-1 ring-border/50">
          <GrainientBackground className="opacity-40" />
        </div>
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 text-center md:py-24 lg:px-6">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
            <h1 className="text-5xl font-extrabold tracking-tighter text-balance sm:text-6xl md:text-7xl lg:text-8xl">
              Pods
            </h1>
            <p className="text-lg text-balance text-muted-foreground sm:text-xl">
              Curated virtual machine environments meant for hands-on learning.
              Browse through a selection of ready-to-use pods to get started.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-12 md:py-16 lg:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3 xl:gap-12">
          {catalogQuery.isLoading
            ? Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-96 w-full" />
              ))
            : visiblePods.map((pod) => (
                <BrowsePodsCard key={pod.id} pod={pod} />
              ))}
        </div>
      </div>
    </div>
  )
}
