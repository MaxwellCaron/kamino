import { IconCheckbox, IconClock } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { RequestsSelectionActions } from "./requests-selection-actions"
import type { UseMutationResult } from "@tanstack/react-query"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type {
  ApiRequestActionResponse,
  ApiRequestScope,
  ApiRequestSummary,
} from "@/features/requests/types/request-types"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { ColumnDef } from "@tanstack/react-table"
import type { DataTableServerPagination } from "@/components/data-table/data-table"
import { formatRequestScope } from "@/features/requests/utils/request-presenters"
import { DataTable } from "@/components/data-table/data-table"

type RequestsPageQueueCardProps = {
  scope: ApiRequestScope
  onScopeChange: (scope: ApiRequestScope) => void
  pendingCount: number
  completedCount: number
  columns: Array<ColumnDef<ApiRequestSummary>>
  activeRequests: Array<ApiRequestSummary>
  isActiveLoading: boolean
  activeError: Error | null
  canReview: boolean
  tree: Array<ApiTreeNode> | undefined
  approveMutation: UseMutationResult<
    ApiRequestActionResponse,
    Error,
    Array<string>,
    unknown
  >
  denyMutation: UseMutationResult<
    ApiRequestActionResponse,
    Error,
    Array<string>,
    unknown
  >
  onOpenConfirm: (config: ConfirmConfig) => void
  serverPagination: DataTableServerPagination
}

export function RequestsPageQueueCard({
  scope,
  onScopeChange,
  pendingCount,
  completedCount,
  columns,
  activeRequests,
  isActiveLoading,
  activeError,
  canReview,
  tree,
  approveMutation,
  denyMutation,
  onOpenConfirm,
  serverPagination,
}: RequestsPageQueueCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              {scope === "pending" ? (
                <IconClock className="size-5 text-muted-foreground" />
              ) : (
                <IconCheckbox className="size-5 text-muted-foreground" />
              )}
              {formatRequestScope(scope)}
            </CardTitle>
            <CardDescription>
              {scope === "pending"
                ? "Pending requests are those that have not been approved or denied yet."
                : "Completed requests are those that have been approved or denied."}
            </CardDescription>
          </div>
          <Tabs
            value={scope}
            onValueChange={(value) => onScopeChange(value as ApiRequestScope)}
            className="w-full lg:w-auto"
          >
            <TabsList className="w-full lg:w-auto">
              <TabsTrigger value="pending">
                Pending
                <Badge variant="outline">{pendingCount}</Badge>
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed
                <Badge variant="outline">{completedCount}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <DataTable
          columns={columns}
          data={activeRequests}
          isLoading={isActiveLoading}
          error={activeError}
          getRowId={(request: ApiRequestSummary) => request.id}
          serverPagination={serverPagination}
          selectionActions={
            canReview && scope === "pending"
              ? ({
                  clearSelection,
                  selectedRows,
                }: {
                  clearSelection: () => void
                  selectedRows: Array<ApiRequestSummary>
                }) => (
                  <RequestsSelectionActions
                    selectedRows={selectedRows}
                    clearSelection={clearSelection}
                    tree={tree}
                    approveMutation={approveMutation}
                    denyMutation={denyMutation}
                    onOpenConfirm={onOpenConfirm}
                  />
                )
              : undefined
          }
        />
      </CardContent>
    </Card>
  )
}
