import { Link } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCheck,
  IconCheckbox,
  IconExternalLink,
  IconHandClick,
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import { RelativeTimeCard } from "@workspace/ui/components/relative-time-card"
import {
  STATUS_ICONS,
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
  getRequestStatusClassName,
} from "./request-presenters"
import type { ApiRequestDetail } from "@/lib/queries"
import {
  AppDialogContent,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { formatVmReference } from "@/lib/utils"

type RequestDetailDialogProps = {
  canReview: boolean
  error: Error | null
  isLoading: boolean
  onApprove: () => void
  onDeny: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  request: ApiRequestDetail | null
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
}: RequestDetailDialogProps) {
  const powerAction = formatRequestPowerAction(request?.inventory?.power_action)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        icon={IconZoom}
        title="Review"
        description="Review the request and determine the outcome."
      >
        <AppDialogScrollBody className="-mb-8 px-4">
          {isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">
              Loading request details...
            </div>
          ) : error ? (
            <Empty className="border bg-background">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconAlertTriangle />
                </EmptyMedia>
                <EmptyTitle>Could Not Load Request</EmptyTitle>
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
                  <ItemMedia variant="icon">
                    <IconHandClick />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>Action</ItemTitle>
                    <ItemDescription>
                      {powerAction && <p>{powerAction}</p>}
                      {request.inventory?.snapshot_name && (
                        <p>
                          {formatRequestKind(request.kind)}:{" "}
                          {request.inventory.snapshot_name}
                        </p>
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
                          {request.inventory?.vmid &&
                            formatVmReference(
                              request.inventory.vmid,
                              request.inventory.item_name
                            )}
                          {request.inventory?.is_template && (
                            <p>Template target</p>
                          )}
                          {!powerAction &&
                            !request.inventory?.snapshot_name &&
                            !request.inventory?.vm_node && (
                              <p className="text-muted-foreground">
                                No extra variables.
                              </p>
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
              >
                <IconX data-icon="inline-start" />
                Deny
              </Button>
              <Button onClick={onApprove} className="w-[50%]">
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
