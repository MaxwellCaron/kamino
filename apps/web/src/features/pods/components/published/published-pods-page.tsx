import { useMemo } from "react"
import { toast } from "sonner"
import { Link, useNavigate } from "@tanstack/react-router"
import { IconPackages, IconPlus } from "@tabler/icons-react"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { getPublishedPodsColumns } from "./published-pods-columns"
import { DataTable } from "@/components/data-table/data-table"
import {
  setPublishedPodStatus,
  usePublishedPodCatalog,
} from "@/features/pods/utils/published-pod-catalog-store"

function CatalogStat({
  title,
  value,
  description,
}: {
  title: string
  value: string
  description: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">
        {description}
      </CardContent>
    </Card>
  )
}

export function PublishedPodsPage() {
  const navigate = useNavigate()
  const pods = usePublishedPodCatalog()

  const stats = useMemo(() => {
    const listed = pods.filter((pod) => pod.status === "listed").length
    const restricted = pods.filter((pod) => pod.audience.length > 0).length
    const totalClones = pods.reduce((sum, pod) => sum + pod.clone_count, 0)

    return {
      total: pods.length,
      listed,
      unlisted: pods.length - listed,
      restricted,
      totalClones,
    }
  }, [pods])

  const columns = useMemo(
    () =>
      getPublishedPodsColumns({
        onEdit: (pod) => {
          navigate({
            to: "/pods/publish",
            search: { podId: pod.id },
          })
        },
        onStatusChange: (pod, status) => {
          const updated = setPublishedPodStatus(pod.id, status)
          if (!updated) {
            return
          }

          toast.success(
            updated.status === "listed"
              ? `${updated.title} is now listed.`
              : `${updated.title} is now unlisted.`
          )
        },
      }),
    [navigate]
  )

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-3xl flex-col gap-3">
            <div className="flex flex-col gap-2">
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
                Published Pods
              </h1>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                Review catalog metadata, flip visibility between listed and
                unlisted, and jump straight into the publish workflow for
                editing.
              </p>
            </div>
          </div>

          <Link
            to="/pods/publish"
            className={`${buttonVariants({ size: "lg" })} cursor-default`}
          >
            <IconPlus data-icon="inline-start" />
            New Pod
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CatalogStat
            title="Pods"
            value={`${stats.total}`}
            description={`${stats.listed} listed and ${stats.unlisted} unlisted pods.`}
          />
          <CatalogStat
            title="Restricted Access"
            value={`${stats.restricted}`}
            description="Pods limited to specific users or groups."
          />
          <CatalogStat
            title="Clones"
            value={`${stats.totalClones}`}
            description="Total clone count across the current catalog."
          />
          <CatalogStat
            title="Visibility"
            value={`${stats.listed}/${stats.total}`}
            description="Pods currently visible in the public browse catalog."
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pod Catalog</CardTitle>
            <CardDescription>
              All published pods. Search by title, creator, or slug.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {pods.length > 0 ? (
              <DataTable
                columns={columns}
                data={pods}
                error={null}
                getRowId={(pod) => pod.id}
                initialPageSize={10}
                isLoading={false}
                showSelectionSummary={false}
              />
            ) : (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconPackages />
                  </EmptyMedia>
                  <EmptyTitle>No published pods yet</EmptyTitle>
                  <EmptyDescription>
                    Create a pod to start shaping the catalog UX.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Link
                    to="/pods/publish"
                    className={`${buttonVariants()} cursor-default`}
                  >
                    <IconPlus data-icon="inline-start" />
                    Create Pod
                  </Link>
                </EmptyContent>
              </Empty>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
