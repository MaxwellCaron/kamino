import { Link } from "@tanstack/react-router"
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconX,
} from "@tabler/icons-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  AppDialogContent,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import type { ApiRequestDetail } from "@/lib/queries"
import {
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
  formatRequestTimestamp,
  getRequestTargetContext,
  getRequestTargetLabel,
  requestStatusVariant,
} from "./request-presenters"

type RequestDetailDialogProps = {
  approvePending: boolean
  canReview: boolean
  denyPending: boolean
  error: Error | null
  isLoading: boolean
  onApprove: () => void
  onDeny: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  request: ApiRequestDetail | null
}

function RequestMetadataCard({
  description,
  title,
  value,
}: {
  description: string
  title: string
  value: string
}) {
  return (
    <Card className="border-dashed">
      <CardHeader className="gap-1 pb-3">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-base">{value}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">
        {description}
      </CardContent>
    </Card>
  )
}

export function RequestDetailDialog({
  approvePending,
  canReview,
  denyPending,
  error,
  isLoading,
  onApprove,
  onDeny,
  onOpenChange,
  open,
  request,
}: RequestDetailDialogProps) {
  const pending = approvePending || denyPending
  const requestContext = request ? getRequestTargetContext(request) : null
  const powerAction = formatRequestPowerAction(request?.inventory?.power_action)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="sm:max-w-4xl"
        icon={IconClock}
        title={request ? getRequestTargetLabel(request) : "Request detail"}
        description={
          request
            ? `${formatRequestKind(request.kind)} submitted by ${request.requester_username}.`
            : "Inspect the queued payload and audit trail."
        }
      >
        <AppDialogScrollBody className="-mb-6 bg-muted/20 px-6">
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
              {request.execution_error ? (
                <Alert variant="destructive">
                  <IconAlertTriangle />
                  <AlertTitle>Execution Failed</AlertTitle>
                  <AlertDescription>{request.execution_error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-3 rounded-3xl border bg-background/95 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={requestStatusVariant(request.status)}>
                    {formatRequestStatus(request.status)}
                  </Badge>
                  <Badge variant="outline">
                    {formatRequestKind(request.kind)}
                  </Badge>
                  {requestContext ? (
                    <span className="text-sm text-muted-foreground">
                      {requestContext}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Request payloads are read-only once submitted. Reviews record
                  an outcome and immediately execute approved work.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <RequestMetadataCard
                  title={request.requester_username}
                  description={`Submitted ${formatRequestTimestamp(request.created_at)}`}
                  value="Requester"
                />
                <RequestMetadataCard
                  title={
                    request.reviewer_username?.trim() || "Not reviewed yet"
                  }
                  description={
                    request.reviewed_at
                      ? `Reviewed ${formatRequestTimestamp(request.reviewed_at)}`
                      : "No review has been recorded."
                  }
                  value="Reviewer"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Payload</CardTitle>
                  <CardDescription>
                    Immutable request values captured at submission time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border bg-muted/30 p-4">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Target
                    </p>
                    <p className="mt-2 font-medium">
                      {getRequestTargetLabel(request)}
                    </p>
                    {request.inventory?.item_id ? (
                      <Link
                        to="/inventory/items/$itemId"
                        params={{ itemId: request.inventory.item_id }}
                        className="mt-2 inline-flex text-sm text-primary underline underline-offset-4"
                      >
                        Open inventory item
                      </Link>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border bg-muted/30 p-4">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Operation
                    </p>
                    <div className="mt-2 flex flex-col gap-2 text-sm">
                      {powerAction ? <p>{powerAction}</p> : null}
                      {request.inventory?.snapshot_name ? (
                        <p>Snapshot: {request.inventory.snapshot_name}</p>
                      ) : null}
                      {request.inventory?.vm_node && request.inventory?.vmid ? (
                        <p>
                          {request.inventory.vm_node} / VM{" "}
                          {request.inventory.vmid}
                        </p>
                      ) : null}
                      {request.inventory?.is_template ? (
                        <p>Template target</p>
                      ) : null}
                      {!powerAction &&
                      !request.inventory?.snapshot_name &&
                      !request.inventory?.vm_node ? (
                        <p className="text-muted-foreground">
                          No extra variables.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Audit trail</CardTitle>
                  <CardDescription>
                    Submission, review, and execution events in order.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {request.events.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {request.events.map((event) => (
                        <div
                          key={event.id}
                          className="flex flex-col gap-2 rounded-2xl border bg-muted/20 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{event.event_kind}</Badge>
                            <span className="text-sm text-muted-foreground">
                              {formatRequestTimestamp(event.created_at)}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {event.actor_username?.trim() || "System"}
                            </span>
                            {event.from_status ? (
                              <span>
                                {" "}
                                moved the request from {
                                  event.from_status
                                } to {event.to_status}.
                              </span>
                            ) : (
                              <span>
                                {" "}
                                set the request to {event.to_status}.
                              </span>
                            )}
                          </div>
                          {event.error_message ? (
                            <p className="text-sm text-destructive">
                              {event.error_message}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty className="border bg-muted/10 p-8">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <IconClock />
                        </EmptyMedia>
                        <EmptyTitle>No Events Recorded</EmptyTitle>
                        <EmptyDescription>
                          This request has not generated an audit timeline yet.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </AppDialogScrollBody>

        <DialogFooter showCloseButton>
          {request?.status === "pending" && canReview ? (
            <>
              <Button variant="destructive" disabled={pending} onClick={onDeny}>
                <IconX data-icon="inline-start" />
                {denyPending ? "Denying..." : "Deny"}
              </Button>
              <Button disabled={pending} onClick={onApprove}>
                <IconCheck data-icon="inline-start" />
                {approvePending ? "Approving..." : "Approve"}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </AppDialogContent>
    </Dialog>
  )
}
