import { useMemo } from "react"
import { toast } from "sonner"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  IconCubePlus,
  IconCubeSend,
  IconPackages,
  IconPlus,
} from "@tabler/icons-react"
import { buttonVariants } from "@workspace/ui/components/button"
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
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { PublishedPodsStatCards } from "./published-pods-stat-cards"
import { getPublishedPodsColumns } from "./published-pods-columns"
import { DataTable } from "@/components/data-table/data-table"
import {
  setPublishedPodStatus,
  usePublishedPodCatalog,
} from "@/features/pods/utils/published-pod-catalog-store"

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
        <Card>
          <CardHeader>
            <CardTitle className="text-4xl font-extrabold tracking-tight text-balance">
              Published Pods
            </CardTitle>
            <CardDescription>
              Review catalog metadata, flip visibility between listed and
              unlisted, and jump straight into the publish workflow for editing.
            </CardDescription>
            <CardAction className="flex gap-2">
              <Link
                to="/pods/create"
                className={`${buttonVariants()} cursor-default`}
              >
                <IconCubePlus data-icon="inline-start" />
                New Pod
              </Link>
              <Link
                to="/pods/publish"
                className={`${buttonVariants()} cursor-default`}
              >
                <IconCubeSend data-icon="inline-start" />
                Publish Pod
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <PublishedPodsStatCards stats={stats} />
          </CardContent>
        </Card>

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
              <Empty className="mx-6 border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconPackages />
                  </EmptyMedia>
                  <EmptyTitle>No published pods yet</EmptyTitle>
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
