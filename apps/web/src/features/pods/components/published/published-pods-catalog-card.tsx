import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { PublishedPodClonesTable } from "./published-pod-clones-table"
import { PublishedPodsEmptyState } from "./published-pods-empty-state"
import type { ColumnDef } from "@tanstack/react-table"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { PendingPrincipalCloneRow } from "@/features/pods/types/published-pods-types"
import { DataTable } from "@/components/data-table/data-table"

export function PublishedPodsCatalogCard({
  columns,
  error,
  isLoading,
  pods,
  pendingCloneRowsByPodId,
  onDismissPendingCloneRow,
}: {
  columns: Array<ColumnDef<PublishedPodCatalogEntry>>
  error: Error | null
  isLoading: boolean
  pods: Array<PublishedPodCatalogEntry>
  pendingCloneRowsByPodId: Record<string, Array<PendingPrincipalCloneRow>>
  onDismissPendingCloneRow: (podId: string, progressId: string) => void
}) {
  return (
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
            error={error}
            expandedRowComponent={(props) => (
              <PublishedPodExpandedRow
                {...props}
                pendingCloneRowsByPodId={pendingCloneRowsByPodId}
                onDismissPendingCloneRow={onDismissPendingCloneRow}
              />
            )}
            getRowCanExpand={() => true}
            getRowId={(pod) => pod.id}
            initialPageSize={10}
            isLoading={isLoading}
            showSelectionSummary={false}
          />
        ) : (
          <PublishedPodsEmptyState />
        )}
      </CardContent>
    </Card>
  )
}

function PublishedPodExpandedRow({
  row: pod,
  pendingCloneRowsByPodId,
  onDismissPendingCloneRow,
}: {
  row: PublishedPodCatalogEntry
  pendingCloneRowsByPodId: Record<string, Array<PendingPrincipalCloneRow>>
  onDismissPendingCloneRow: (podId: string, progressId: string) => void
}) {
  return (
    <PublishedPodClonesTable
      pod={pod}
      pendingRows={pendingCloneRowsByPodId[pod.id] ?? []}
      onDismissPendingRow={(progressId) =>
        onDismissPendingCloneRow(pod.id, progressId)
      }
    />
  )
}
