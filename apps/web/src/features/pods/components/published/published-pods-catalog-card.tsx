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
import type { AppTableFeatures } from "@/components/data-table/data-table-types"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import { DataTable } from "@/components/data-table/data-table"

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

function PublishedPodExpandedRow({ row: pod }: { row: PublishedPodCatalogEntry }) {
  return <PublishedPodClonesTable pod={pod} />
}
