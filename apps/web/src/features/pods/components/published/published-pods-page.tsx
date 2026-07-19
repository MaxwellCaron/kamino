import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Delete01Icon } from "@hugeicons/core-free-icons"
import { PublishedPodsCatalogCard } from "./published-pods-catalog-card"
import { PublishedPodsHeaderCard } from "./published-pods-header-card"
import { getPublishedPodsColumns } from "./published-pods-columns"
import { ManagerCloneDialog } from "./manager-clone-dialog"
import { ManualRouterCloneDialog } from "./manual-router-clone-dialog"
import type { PendingCloneBulkAction } from "../../types/published-pods-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { PublishedPodsStats } from "@/features/pods/types/published-pods-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import { PreloadOverlay } from "@/components/loading-overlay"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { usePublishedPodsManagerClones } from "@/features/pods/hooks/use-published-pods-manager-clones"
import { usePublishedPodsPageMutations } from "@/features/pods/hooks/use-published-pods-page-mutations"
import { usePublishedPodsBulkConfirm } from "@/features/pods/hooks/use-published-pods-bulk-confirm"
import { publishedPodsQueryOptions } from "@/features/pods/api/publish-pod-api"

function computePublishedPodsStats(
  publishedPods: Array<PublishedPodCatalogEntry>
): PublishedPodsStats {
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
}

export function PublishedPodsPage() {
  const navigate = useNavigate()
  const {
    data: podsData,
    error: podsError,
    isLoading: isPodsLoading,
  } = useQuery(publishedPodsQueryOptions)
  const pods = podsData ?? []
  const [pendingDeletePod, setPendingDeletePod] =
    useState<PublishedPodCatalogEntry | null>(null)
  const [pendingCloneBulkAction, setPendingCloneBulkAction] =
    useState<PendingCloneBulkAction>(null)
  const [manualRouterCloneOpen, setManualRouterCloneOpen] = useState(false)

  const {
    pendingPrincipalIdsByPodId,
    pendingManagerClonePod,
    setPendingManagerClonePod,
    handleManagerClone,
  } = usePublishedPodsManagerClones()

  const {
    statusMutation,
    showStatusToast,
    deleteMutation,
    deleteCloneMutation,
  } = usePublishedPodsPageMutations({
    onDeleteSettled: () => setPendingDeletePod(null),
  })

  const stats = useMemo(
    () => computePublishedPodsStats(podsData ?? []),
    [podsData]
  )

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
          showStatusToast(pod, status)
        },
        onCloneBulkAction: (pod, action) => {
          setPendingCloneBulkAction({ pod, action })
        },
        cloneBulkActionPending: deleteCloneMutation.isPending,
        statusChangePendingId: statusMutation.isPending
          ? statusMutation.variables.id
          : null,
        onManagerClone: setPendingManagerClonePod,
      }),
    [
      navigate,
      statusMutation,
      showStatusToast,
      deleteCloneMutation.isPending,
      setPendingManagerClonePod,
    ]
  )

  const deleteConfirm: ConfirmConfig | null = pendingDeletePod
    ? {
        title: "Delete Catalog Entry?",
        description: `This deletes "${pendingDeletePod.title}" from the published catalog database only. The Pod Folder, Pod Template Folder, and Proxmox VMs are not deleted.`,
        actionLabel: "Delete",
        icon: Delete01Icon,
        variant: "destructive",
        onConfirm: () => {
          showSingleMutationToast({
            title: "Deleting",
            name: pendingDeletePod.title,
            promise: () => deleteMutation.mutateAsync(pendingDeletePod.id),
            successDescription: "Deleted",
          })
        },
      }
    : null

  const bulkConfirm = usePublishedPodsBulkConfirm({
    pendingCloneBulkAction,
    deleteCloneMutation,
  })

  return (
    <div className="@container/main relative flex flex-1 flex-col gap-2">
      <PreloadOverlay active={isPodsLoading} label="Loading published pods" />
      {!isPodsLoading && (
        <>
          <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
            <PublishedPodsHeaderCard
              stats={stats}
              onCloneRouter={() => setManualRouterCloneOpen(true)}
            />
            <PublishedPodsCatalogCard
              columns={columns}
              error={podsError}
              isLoading={isPodsLoading}
              pods={pods}
            />
          </div>

          {deleteConfirm && (
            <ConfirmDialog
              config={deleteConfirm}
              onClose={() => setPendingDeletePod(null)}
            />
          )}
          {bulkConfirm && (
            <ConfirmDialog
              config={bulkConfirm}
              onClose={() => setPendingCloneBulkAction(null)}
            />
          )}
          <ManagerCloneDialog
            pod={pendingManagerClonePod}
            open={pendingManagerClonePod !== null}
            onOpenChange={(open) => {
              if (!open) setPendingManagerClonePod(null)
            }}
            pendingPrincipalIdsByPodId={pendingPrincipalIdsByPodId}
            onConfirm={(pod, principals) => handleManagerClone(pod, principals)}
          />
          <ManualRouterCloneDialog
            open={manualRouterCloneOpen}
            onOpenChange={setManualRouterCloneOpen}
          />
        </>
      )}
    </div>
  )
}
