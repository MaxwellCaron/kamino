import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  IconCubeOff,
  IconCubePlus,
  IconCubeSend,
  IconTrash,
} from "@tabler/icons-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
} from "@workspace/ui/components/alert-dialog"
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { PublishedPodClonesTable } from "./published-pod-clones-table"
import { PublishedPodsPageSkeleton } from "./published-pods-skeleton"
import { PublishedPodsStatCards } from "./published-pods-stat-cards"
import { getPublishedPodsColumns } from "./published-pods-columns"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import { AppAlertDialogContent } from "@/components/dialogs/app-dialog"
import { DataTable } from "@/components/data-table/data-table"
import {
  deletePublishedPod,
  podCatalogQueryOptions,
  publishedPodsQueryOptions,
  setPublishedPodStatus,
} from "@/features/pods/api/publish-pod-api"

export function PublishedPodsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const {
    data: podsData,
    error: podsError,
    isLoading: isPodsLoading,
  } = useQuery(publishedPodsQueryOptions)
  const pods = podsData ?? []
  const [pendingDeletePod, setPendingDeletePod] =
    useState<PublishedPodCatalogEntry | null>(null)
  const statusMutation = useMutation({
    mutationFn: setPublishedPodStatus,
    onSuccess: (updated) => {
      queryClient.setQueryData(
        publishedPodsQueryOptions.queryKey,
        pods.map((pod) => (pod.id === updated.id ? updated : pod))
      )
      toast.success(
        updated.status === "listed"
          ? `${updated.title} is now listed.`
          : `${updated.title} is now unlisted.`
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update published pod status."
      )
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deletePublishedPod,
    onSuccess: (_, deletedPodID) => {
      queryClient.setQueryData(
        publishedPodsQueryOptions.queryKey,
        (current: Array<PublishedPodCatalogEntry> | undefined) =>
          current?.filter((pod) => pod.id !== deletedPodID) ?? []
      )
      queryClient.removeQueries({
        queryKey: ["pods", "published", deletedPodID],
      })
      void queryClient.invalidateQueries({
        queryKey: podCatalogQueryOptions.queryKey,
      })
      setPendingDeletePod(null)
      toast.success("Published Pod catalog entry deleted.")
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete published Pod catalog entry."
      )
    },
  })

  const stats = useMemo(() => {
    const publishedPods = podsData ?? []
    const listed = publishedPods.filter((pod) => pod.status === "listed").length
    const restricted = publishedPods.filter(
      (pod) => pod.audience.length > 0
    ).length
    const totalClones = publishedPods.reduce(
      (sum, pod) => sum + pod.clone_count,
      0
    )

    return {
      total: publishedPods.length,
      listed,
      unlisted: publishedPods.length - listed,
      restricted,
      totalClones,
    }
  }, [podsData])

  const columns = useMemo(
    () =>
      getPublishedPodsColumns({
        onDelete: setPendingDeletePod,
        onEdit: (pod) => {
          navigate({
            to: "/pods/publish",
            search: { podId: pod.id },
          })
        },
        onStatusChange: (pod, status) => {
          statusMutation.mutate({ id: pod.id, status })
        },
      }),
    [navigate, statusMutation]
  )

  if (isPodsLoading) {
    return <PublishedPodsPageSkeleton />
  }

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
                className={`${buttonVariants({ variant: "outline" })} cursor-pointer`}
              >
                <IconCubePlus data-icon="inline-start" />
                Create
              </Link>
              <Link
                to="/pods/publish"
                className={`${buttonVariants()} cursor-pointer`}
              >
                <IconCubeSend data-icon="inline-start" />
                Publish
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
                error={podsError}
                getRowCanExpand={(pod) => pod.clone_count > 0}
                getRowId={(pod) => pod.id}
                initialPageSize={10}
                isLoading={isPodsLoading}
                renderExpandedRow={(pod) => (
                  <PublishedPodClonesTable pod={pod} />
                )}
                showSelectionSummary={false}
              />
            ) : (
              <div className="px-6">
                <Empty className="min-h-[55vh] border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconCubeOff />
                    </EmptyMedia>
                    <EmptyTitle>No published pods yet</EmptyTitle>
                    <EmptyDescription>
                      You haven&apos;t published any pods yet. Get started by
                      creating and publishing your first pod.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent className="flex-row justify-center gap-2">
                    <Link
                      to="/pods/create"
                      className={`${buttonVariants({ variant: "outline" })} cursor-pointer`}
                    >
                      <IconCubePlus data-icon="inline-start" />
                      Create
                    </Link>
                    <Link
                      to="/pods/publish"
                      className={`${buttonVariants()} cursor-pointer`}
                    >
                      <IconCubeSend data-icon="inline-start" />
                      Publish
                    </Link>
                  </EmptyContent>
                </Empty>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={pendingDeletePod !== null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setPendingDeletePod(null)
          }
        }}
      >
        <AppAlertDialogContent
          open={pendingDeletePod !== null}
          icon={IconTrash}
          title="Delete Catalog Entry?"
          description={
            pendingDeletePod
              ? `This deletes "${pendingDeletePod.title}" from the published catalog database only. The Pod Folder, Pod Template Folder, and Proxmox VMs are not deleted.`
              : ""
          }
        >
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                if (!pendingDeletePod) return
                deleteMutation.mutate(pendingDeletePod.id)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </div>
  )
}
