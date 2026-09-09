import { Link } from "@tanstack/react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert01Icon,
  Cancel01Icon,
  CheckmarkSquare01Icon,
  ExternalLinkIcon,
  Target01Icon,
  Tick01Icon,
  UserQuestion01Icon,
  UserSearch01Icon,
  ZoomIcon,
} from "@hugeicons/core-free-icons"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Dialog, DialogFooter } from "@workspace/ui/components/dialog"
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

import {
  STATUS_ICONS,
  formatRequestKind,
  formatRequestPowerAction,
  formatRequestStatus,
  getRequestIcon,
  getRequestStatusClassName,
} from "../utils/request-presenters"
import type { IconSvgElement } from "@hugeicons/react"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { ApiRequestDetail } from "@/features/requests/types/request-types"
import { findTreePath } from "@/features/inventory/utils/inventory-tree"

import {
  AppDialogContent,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { PreloadOverlay } from "@/components/loading-overlay"
import { AppActionButton } from "@/components/actions/app-action-button"
import { formatVmReference } from "@/features/shared/utils/format"
import { AppEmptyState } from "@/components/feedback/app-empty-state"

type RequestDetailDialogProps = {
  canReview: boolean
  disabled?: boolean
  approvePending?: boolean
  denyPending?: boolean
  error: Error | null
  isLoading: boolean
  onApprove: () => void
  onDeny: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
  request: ApiRequestDetail | null
  tree?: Array<ApiTreeNode>
}

function RequestStatusBadge({ request }: { request: ApiRequestDetail }) {
  const StatusIcon = STATUS_ICONS[request.status]

  return (
    <Badge className={getRequestStatusClassName(request.status)}>
      <HugeiconsIcon icon={StatusIcon} className="size-3.5!" />
      {formatRequestStatus(request.status)}
    </Badge>
  )
}

function RequestTarget({
  pathLabel,
  powerAction,
  request,
  targetLabel,
}: {
  pathLabel: string | null
  powerAction: string | null
  request: ApiRequestDetail
  targetLabel: string
}) {
  const targetContent = (
    <>
      <ItemMedia variant="icon">
        <HugeiconsIcon icon={Target01Icon} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>Target</ItemTitle>
        <ItemDescription>
          {request.inventory?.item_id && pathLabel ? `${pathLabel} / ` : ""}
          {targetLabel}
          {request.inventory?.item_id && request.inventory.is_template ? (
            <div>Template target</div>
          ) : null}
          {!powerAction &&
          !request.inventory?.snapshot_name &&
          !request.inventory?.vm_node ? (
            <div className="text-muted-foreground">No extra variables.</div>
          ) : null}
        </ItemDescription>
      </ItemContent>
    </>
  )

  if (!request.inventory?.item_id) {
    return <Item variant="muted" render={<Item>{targetContent}</Item>} />
  }

  return (
    <Item
      variant="muted"
      className="cursor-pointer"
      render={
        <Link
          to="/inventory/items/$itemId"
          params={{ itemId: request.inventory.item_id }}
          target="_blank"
          rel="noopener noreferrer"
        >
          {targetContent}
          <ItemActions>
            <HugeiconsIcon icon={ExternalLinkIcon} className="size-4" />
          </ItemActions>
        </Link>
      }
    />
  )
}

function RequestSummary({
  icon,
  pathLabel,
  powerAction,
  request,
  targetLabel,
}: {
  icon: IconSvgElement
  pathLabel: string | null
  powerAction: string | null
  request: ApiRequestDetail
  targetLabel: string
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Request
      </div>
      <Item variant="muted">
        <ItemMedia variant="icon">
          <HugeiconsIcon icon={UserQuestion01Icon} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{request.requester_username}</ItemTitle>
          <ItemDescription>
            {request.created_at ? (
              <div className="flex gap-1">
                <span>Requested</span>
                <RelativeTimeCard
                  date={request.created_at}
                  timezones={["UTC"]}
                  delay={50}
                  closeDelay={150}
                />
              </div>
            ) : null}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <FacehashIcon name={request.requester_username} />
        </ItemActions>
      </Item>
      <Item variant="muted">
        <ItemMedia variant="icon">
          <HugeiconsIcon icon={icon} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Action</ItemTitle>
          <ItemDescription>
            {powerAction ? <div>{powerAction}</div> : null}
            {request.inventory?.snapshot_name ? (
              <div>
                {formatRequestKind(request.kind)}:{" "}
                {request.inventory.snapshot_name}
              </div>
            ) : null}
            {!powerAction && !request.inventory?.snapshot_name ? (
              <div>{formatRequestKind(request.kind)}</div>
            ) : null}
          </ItemDescription>
        </ItemContent>
      </Item>
      <RequestTarget
        pathLabel={pathLabel}
        powerAction={powerAction}
        request={request}
        targetLabel={targetLabel}
      />
    </div>
  )
}

function RequestResponse({ request }: { request: ApiRequestDetail }) {
  if (!request.reviewer_username) return null

  return (
    <div className="space-y-4">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Response
      </div>
      <Item variant="muted">
        <ItemMedia variant="icon">
          <HugeiconsIcon icon={UserSearch01Icon} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{request.reviewer_username}</ItemTitle>
          <ItemDescription>
            {request.reviewed_at ? (
              <div className="flex gap-1">
                <span>Reviewed</span>
                <RelativeTimeCard
                  date={request.reviewed_at}
                  timezones={["UTC"]}
                  delay={50}
                  closeDelay={150}
                />
              </div>
            ) : null}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <FacehashIcon name={request.reviewer_username} />
        </ItemActions>
      </Item>
      <Item variant="muted">
        <ItemMedia variant="icon">
          <HugeiconsIcon icon={CheckmarkSquare01Icon} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Status</ItemTitle>
          <ItemDescription>
            <RequestStatusBadge request={request} />
          </ItemDescription>
        </ItemContent>
      </Item>
    </div>
  )
}

function RequestDialogBody({
  error,
  icon,
  isLoading,
  pathLabel,
  powerAction,
  request,
  targetLabel,
}: {
  error: Error | null
  icon: IconSvgElement | null
  isLoading: boolean
  pathLabel: string | null
  powerAction: string | null
  request: ApiRequestDetail | null
  targetLabel: string
}) {
  if (isLoading) return null

  if (error) {
    return (
      <AppEmptyState
        className="border border-dashed"
        description={error.message}
        icon={Alert01Icon}
        iconClassName="text-destructive"
        mediaClassName="bg-destructive/10 text-destructive"
        title="Error Loading Request"
      />
    )
  }

  if (!request || !icon) return null

  return (
    <div className="flex flex-col gap-5">
      {request.execution_error ? (
        <Alert variant="destructive">
          <HugeiconsIcon icon={Alert01Icon} />
          <AlertTitle>Execution Failed</AlertTitle>
          <AlertDescription>{request.execution_error}</AlertDescription>
        </Alert>
      ) : null}
      <RequestSummary
        icon={icon}
        pathLabel={pathLabel}
        powerAction={powerAction}
        request={request}
        targetLabel={targetLabel}
      />
      <RequestResponse request={request} />
    </div>
  )
}

function RequestReviewFooter({
  approvePending,
  canReview,
  denyPending,
  disabled,
  error,
  isLoading,
  onApprove,
  onDeny,
  request,
}: {
  approvePending: boolean
  canReview: boolean
  denyPending: boolean
  disabled: boolean
  error: Error | null
  isLoading: boolean
  onApprove: () => void
  onDeny: () => void
  request: ApiRequestDetail | null
}) {
  if (request?.status !== "pending" || !canReview) return null

  const actionsDisabled =
    isLoading || error !== null || approvePending || denyPending || disabled

  return (
    <DialogFooter>
      <AppActionButton
        variant="destructive"
        onClick={onDeny}
        className="w-[50%]"
        pending={denyPending}
        disabled={actionsDisabled}
      >
        <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" />
        Deny
      </AppActionButton>
      <AppActionButton
        onClick={onApprove}
        className="w-[50%]"
        pending={approvePending}
        disabled={actionsDisabled}
      >
        <HugeiconsIcon icon={Tick01Icon} data-icon="inline-start" />
        Approve
      </AppActionButton>
    </DialogFooter>
  )
}

export function RequestDetailDialog({
  approvePending = false,
  canReview,
  disabled = false,
  denyPending = false,
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
  const targetLabel = request?.inventory?.vmid
    ? formatVmReference(request.inventory.vmid, request.inventory.item_name)
    : request?.kind === "personal_pod.create"
      ? "Personal pod"
      : (request?.inventory?.item_name ?? "Inventory item")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        open={open}
        icon={ZoomIcon}
        title="Review"
        description="Review the request and determine the outcome."
      >
        <AppDialogScrollBody className="relative -mb-8 min-h-125 px-4">
          <PreloadOverlay active={isLoading} label="Loading request details" />
          <RequestDialogBody
            error={error}
            icon={Icon}
            isLoading={isLoading}
            pathLabel={pathLabel}
            powerAction={powerAction}
            request={request}
            targetLabel={targetLabel}
          />
        </AppDialogScrollBody>
        <RequestReviewFooter
          approvePending={approvePending}
          canReview={canReview}
          denyPending={denyPending}
          disabled={disabled}
          error={error}
          isLoading={isLoading}
          onApprove={onApprove}
          onDeny={onDeny}
          request={request}
        />
      </AppDialogContent>
    </Dialog>
  )
}
