import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { AppTableFeatures } from "@/lib/data-table-types"
import type { ColumnDef } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import type { PublishedPodCatalogEntry } from "@/lib/pods/pod-types"
import { PublishedPodClonesTable } from "@/components/pods/published/published-pod-clones-table"
import { PublishedPodsEmptyState } from "@/components/pods/published/published-pods-empty-state"

export function PublishedPodsCatalogCard({
  columns,
  error,
  isLoading,
  pods,
}: {
  columns: Array<ColumnDef<AppTableFeatures, PublishedPodCatalogEntry>>
  error: Error | null
  isLoading: boolean
  pods: Array<PublishedPodCatalogEntry>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pod Catalog</CardTitle>
        <CardDescription>
          All published pods. Search by title, creator, clone target, or slug.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {pods.length > 0 ? (
          <DataTable
            columns={columns}
            data={pods}
            error={error}
            searchLabel="Search published pods"
            expandedRowComponent={(props) => (
              <PublishedPodExpandedRow {...props} />
            )}
            features={{ loading: isLoading, selectionSummary: false }}
            getRowCanExpand={() => true}
            getRowId={(pod) => pod.id}
            initialPageSize={10}
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
}: {
  row: PublishedPodCatalogEntry
}) {
  return <PublishedPodClonesTable pod={pod} />
}
