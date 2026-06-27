import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { HugeiconsIcon } from "@hugeicons/react"
import { Shield01Icon } from "@hugeicons/core-free-icons"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { actionEventsQueryOptions } from "../api/audit-api"
import { columns } from "./audit-columns"
import type { PaginationState } from "@tanstack/react-table"
import { DataTable } from "@/components/data-table/data-table"
import { TablePageSkeleton } from "@/components/loading-skeletons"

export function AuditPage() {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  })
  const [search, setSearch] = useState("")

  const { data, error, isLoading } = useQuery({
    ...actionEventsQueryOptions({
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
      search,
    }),
    placeholderData: keepPreviousData,
  })

  if (isLoading) {
    return <TablePageSkeleton titleWidth="w-32" />
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Shield01Icon}
                className="size-7 text-muted-foreground"
              />
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
              data={data?.items ?? []}
              isLoading={isLoading}
              error={error}
              serverPagination={{
                mode: "server",
                pagination,
                onPaginationChange: setPagination,
                rowCount: data?.total ?? 0,
                search,
                onSearchChange: setSearch,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
