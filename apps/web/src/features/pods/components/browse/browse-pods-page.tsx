import { useQuery } from "@tanstack/react-query"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { IconCubeOff } from "@tabler/icons-react"
import { BrowsePodsCard } from "./browse-pods-card"
import {
  BrowsePodsGridSkeleton,
  browsePodsGridClassName,
} from "./browse-pods-skeleton"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { GrainientBackground } from "@/components/grainient-background"
import { podCatalogQueryOptions } from "@/features/pods/api/publish-pod-api"

export function BrowsePodsPage() {
  const { data: catalog, isLoading: isCatalogLoading, error } = useQuery(
    podCatalogQueryOptions
  )
  const visiblePods = catalog ?? []

  return (
    <div className="@container/main flex flex-1 flex-col">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 mb-1 overflow-hidden rounded-b-[40px] shadow ring-1 ring-border/50">
          <GrainientBackground className="opacity-40" />
        </div>
        <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 text-center md:py-24 lg:px-6">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
            <h1 className="font-heading text-5xl font-extrabold tracking-tighter text-balance sm:text-6xl md:text-7xl lg:text-8xl">
              Pods
            </h1>
            <p className="text-base text-balance text-muted-foreground sm:text-lg">
              Curated virtual machine environments meant for hands-on learning.
              Browse through a selection of ready-to-use pods to get started.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-12 md:py-16 lg:px-6">
        {isCatalogLoading ? (
          <BrowsePodsGridSkeleton />
        ) : error ? (
          <InlineErrorAlert
            error={error}
            fallback="Failed to load pods."
            title="Pods Error"
            className="mx-auto max-w-lg"
          />
        ) : visiblePods.length === 0 ? (
          <Empty className="min-h-[45vh] border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconCubeOff />
              </EmptyMedia>
              <EmptyTitle>No Pods</EmptyTitle>
              <EmptyDescription>
                There has not been any pods published yet or you do not have the
                necessary permissions to view them.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className={browsePodsGridClassName}>
            {visiblePods.map((pod) => (
              <BrowsePodsCard key={pod.id} pod={pod} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
