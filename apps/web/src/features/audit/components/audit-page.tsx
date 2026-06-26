import { useMemo } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { IconShield } from "@tabler/icons-react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { actionEventsQueryOptions } from "../api/audit-api"
import { columns } from "./audit-columns"
import { DataTable } from "@/components/data-table/data-table"

export function AuditPage() {
  const { data, error, isLoading, isFetchingNextPage } = useInfiniteQuery(
    actionEventsQueryOptions()
  )

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data?.pages]
  )

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconShield className="size-7 text-muted-foreground" />
              <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
                Audit Logs
              </h1>
            </CardTitle>
            <CardDescription>
              Direct VM and pod actions performed outside request workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <DataTable
              columns={columns}
              data={items}
              isLoading={isLoading || isFetchingNextPage}
              error={error}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
