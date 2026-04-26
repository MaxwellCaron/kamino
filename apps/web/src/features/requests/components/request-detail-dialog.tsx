import { Link } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCheck,
  IconCheckbox,
  IconExternalLink,
  IconTargetArrow,
  IconUserQuestion,
  IconUserSearch,
  IconX,
  IconZoom,
} from "@tabler/icons-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import { Skeleton } from "@workspace/ui/components/skeleton"

import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import { findTreePath } from "@/features/inventory/utils/inventory-tree"
import type { ApiRequestDetail } from "@/features/requests/types/request-types"

import {
  AppDialogContent,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { formatVmReference } from "@/features/shared/utils/utils"

import {
  STATUS_ICONS,
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
  getRequestIcon,
  getRequestStatusClassName,
} from "../utils/request-presenters"

type RequestDetailDialogProps = {
  canReview: boolean
  error: Error | null
  isLoading: boolean
  onApprove: () => void
  onDeny: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  request: ApiRequestDetail | null
  tree?: Array<ApiTreeNode>
}

export function RequestDetailDialog({
  canReview,
  error,
  isLoading,
  onApprove,
  onDeny,
  onOpenChange,
  open,
  request,
  tree,
}: RequestDetailDialogProps) {
  const powerAction = formatRequestPowerAction(request?.inventory?.power_action)

  const Icon = request
    ? getRequestIcon(request.kind, request.inventory?.power_action)
    : null

  const path =
    tree && request?.inventory?.item_id
      ? findTreePath(tree, request.inventory.item_id)
      : null

  const pathLabel = path
    ? path
        .slice(1, -1)
        .map((n) => n.name)
        .join(" / ")
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={open}
        icon={IconZoom}
        title="Review"
        description="Review the request and determine the outcome."
      >
        <AppDialogScrollBody className="-mb-8 px-4">
          {isLoading ? (
            <div className="h-125 text-sm text-muted-foreground">
              <div className="space-y-4">
                <Skeleton className="h-4 w-24" />
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-18" />
                ))}
              </div>
              <div className="space-y-4 pt-8">
                <Skeleton className="h-4 w-24" />
                {Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-18" />
                ))}
              </div>
            </div>
          ) : error ? (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="bg-destructive/10 text-destructive"
                >
                  <IconAlertTriangle />
                </EmptyMedia>
                <EmptyTitle>Error Loading Request</EmptyTitle>
                <EmptyDescription>{error.message}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : request ? (
            <div className="flex flex-col gap-5">
              {request.execution_error && (
                <Alert variant="destructive">
                  <IconAlertTriangle />
                  <AlertTitle>Execution Failed</AlertTitle>
                  <AlertDescription>{request.execution_error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Request
                </div>
                <Item variant="muted">
                  <ItemMedia variant="icon">
                    <IconUserQuestion />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{request.requester_username}</ItemTitle>
                    <ItemDescription>
                      {request.created_at && (
                        <div className="flex gap-1">
                          <span>Requested</span>
                          <RelativeTimeCard
                            date={request.created_at}
                            timezones={["UTC"]}
                            delay={50}
                            closeDelay={150}
                          />
                        </div>
                      )}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <FacehashIcon name={request.requester_username} />
                  </ItemActions>
                </Item>
                <Item variant="muted">
                  <ItemMedia variant="icon">{Icon && <Icon />}</ItemMedia>
                  <ItemContent>
                    <ItemTitle>Action</ItemTitle>
                    <ItemDescription>
                      {powerAction && <div>{powerAction}</div>}
                      {request.inventory?.snapshot_name && (
                        <div>
                          {formatRequestKind(request.kind)}:{" "}
                          {request.inventory.snapshot_name}
                        </div>
                      )}
                      {!powerAction && !request.inventory?.snapshot_name && (
                        <div>{formatRequestKind(request.kind)}</div>
                      )}
                    </ItemDescription>
                  </ItemContent>
                </Item>
                <Item
                  variant="muted"
                  className="cursor-default"
                  render={
                    <Link
                      to="/inventory/items/$itemId"
                      params={{ itemId: request.inventory?.item_id || "" }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ItemMedia variant="icon">
                        <IconTargetArrow />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>Target</ItemTitle>
                        <ItemDescription>
                          {pathLabel}
                          {" / "}
                          {request.inventory?.vmid &&
                            formatVmReference(
                              request.inventory.vmid,
                              request.inventory.item_name
                            )}
                          {request.inventory?.is_template && (
                            <div>Template target</div>
                          )}
                          {!powerAction &&
                            !request.inventory?.snapshot_name &&
                            !request.inventory?.vm_node && (
                              <div className="text-muted-foreground">
                                No extra variables.
                              </div>
                            )}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <IconExternalLink className="size-4" />
                      </ItemActions>
                    </Link>
                  }
                />
              </div>

              {request.reviewer_username && (
                <div className="space-y-4">
                  <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Response
                  </div>
                  <Item variant="muted">
                    <ItemMedia variant="icon">
                      <IconUserSearch />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{request.reviewer_username}</ItemTitle>
                      <ItemDescription>
                        {request.reviewed_at && (
                          <div className="flex gap-1">
                            <span>Reviewed</span>
                            <RelativeTimeCard
                              date={request.reviewed_at}
                              timezones={["UTC"]}
                              delay={50}
                              closeDelay={150}
                            />
                          </div>
                        )}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <FacehashIcon name={request.reviewer_username} />
                    </ItemActions>
                  </Item>
                  <Item variant="muted">
                    <ItemMedia variant="icon">
                      <IconCheckbox />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>Status</ItemTitle>
                      <ItemDescription>
                        <Badge
                          className={getRequestStatusClassName(request.status)}
                        >
                          {(() => {
                            const StatusIcon = STATUS_ICONS[request.status]
                            return <StatusIcon className="size-3.5!" />
                          })()}
                          {formatRequestStatus(request.status)}
                        </Badge>
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                </div>
              )}
            </div>
          ) : null}
        </AppDialogScrollBody>

        {request?.status === "pending" && canReview && (
          <DialogFooter>
            <>
              <Button
                variant="destructive"
                onClick={onDeny}
                className="w-[50%]"
                disabled={isLoading || error !== null}
              >
                <IconX data-icon="inline-start" />
                Deny
              </Button>
              <Button
                onClick={onApprove}
                className="w-[50%]"
                disabled={isLoading || error !== null}
              >
                <IconCheck data-icon="inline-start" />
                Approve
              </Button>
            </>
          </DialogFooter>
        )}
      </AppDialogContent>
    </Dialog>
  )
}
