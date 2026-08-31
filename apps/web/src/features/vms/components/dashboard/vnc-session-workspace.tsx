import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useParams } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { cn } from "@workspace/ui/lib/utils"

import type {
  ApiInventoryItem,
  ApiTreeNode,
} from "@/features/inventory/types/inventory-types"
import type { VncConnectionStatus } from "@/features/vms/components/dashboard/vnc-console"
import { inventoryItemQueryOptions } from "@/features/inventory/api/inventory-api"
import { useInventoryTreeDataContext } from "@/features/inventory/components/tree/inventory-tree-context"
import { getVmCapabilities } from "@/features/inventory/utils/inventory-capabilities"
import { vmStatusQueryOptions } from "@/features/vms/api/vm-api"
import { VncConsole } from "@/features/vms/components/dashboard/vnc-console"
import { useVncSessionVisibilityPublisher } from "@/features/vms/components/dashboard/vnc-session-visibility-context"
import { isApiErrorStatus } from "@/features/auth/api/auth-api"

type ConsoleTarget = {
  itemId: string
  guestType?: "qemu" | "lxc"
  powerStatus: string | undefined
  vmName?: string | null
  vmid?: number | null
}

type RetainedSession = {
  itemId: string
  target: ConsoleTarget
  status: VncConnectionStatus
}

type ConsolePanel = {
  itemId: string
  target: ConsoleTarget
  isActive: boolean
}

type RetentionState = "valid" | "invalid" | "unknown"

function toTreeNode(item: ApiInventoryItem): ApiTreeNode {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    permissions: item.permissions,
    vm: item.vm,
  }
}

function resolveConsoleTarget(
  itemId: string,
  node: ApiTreeNode | undefined,
  powerStatus: string | undefined
): ConsoleTarget | null {
  if (!node || node.kind !== "vm" || !node.vm) {
    return null
  }

  const isTemplate = node.vm.is_template
  const capabilities = getVmCapabilities(node.permissions, {
    isTemplate,
    guestType: node.vm.guest_type,
  })

  if (!capabilities.console.enabled) {
    return null
  }

  return {
    itemId,
    guestType: node.vm.guest_type,
    powerStatus,
    vmName: node.name,
    vmid: node.vm.vmid,
  }
}

function isRetainedStatus(status: VncConnectionStatus): boolean {
  return (
    status === "connecting" || status === "connected" || status === "expired"
  )
}

function isPinnedConsoleStatus(
  status: VncConnectionStatus | null
): status is "connecting" | "connected" | "expired" {
  return (
    status === "connecting" ||
    status === "connected" ||
    status === "expired"
  )
}

function subscribeToDocumentVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange)
  return () => document.removeEventListener("visibilitychange", onChange)
}

function getDocumentVisibility(): boolean {
  return document.visibilityState === "visible"
}

function getServerDocumentVisibility(): boolean {
  return true
}

export function VncSessionWorkspace() {
  const itemId = useParams({ strict: false }).itemId
  const {
    getItemData,
    getStatus,
    isLoading: isTreeLoading,
    error: treeError,
  } = useInventoryTreeDataContext()
  const { data: vmStatuses } = useQuery(vmStatusQueryOptions)

  const treeNode = itemId ? getItemData(itemId) : undefined
  const { data: fallbackItem, isLoading: isFallbackLoading } = useQuery({
    ...inventoryItemQueryOptions(itemId ?? ""),
    enabled: !!itemId && !treeNode,
  })

  const routeNode = useMemo(() => {
    if (treeNode) {
      return treeNode
    }
    if (fallbackItem) {
      return toTreeNode(fallbackItem)
    }
    return undefined
  }, [treeNode, fallbackItem])

  const resolvePowerStatus = useCallback(
    (targetItemId: string, node: ApiTreeNode | undefined) => {
      const fromTree = getStatus(targetItemId)
      if (fromTree !== undefined) {
        return fromTree
      }
      const vmid = node?.vm?.vmid
      if (vmid !== undefined && vmStatuses) {
        return vmStatuses[vmid]
      }
      return undefined
    },
    [getStatus, vmStatuses]
  )

  const activeTarget = useMemo(() => {
    if (!itemId || (isTreeLoading && !treeNode) || isFallbackLoading) {
      return null
    }
    const powerStatus = resolvePowerStatus(itemId, routeNode)
    return resolveConsoleTarget(itemId, routeNode, powerStatus)
  }, [
    itemId,
    isTreeLoading,
    treeNode,
    isFallbackLoading,
    routeNode,
    resolvePowerStatus,
  ])

  const [retainedSession, setRetainedSession] =
    useState<RetainedSession | null>(null)

  const retainedItemId = retainedSession?.itemId
  const needsRetainedFallback =
    !!retainedItemId && !getItemData(retainedItemId)
  const { data: retainedFallbackItem, error: retainedFallbackError } = useQuery({
    ...inventoryItemQueryOptions(retainedItemId ?? ""),
    enabled: needsRetainedFallback,
  })

  const buildTarget = useCallback(
    (targetItemId: string): ConsoleTarget | null => {
      const fallbackSessionItem =
        targetItemId === retainedItemId ? retainedFallbackItem : undefined
      const node =
        getItemData(targetItemId) ??
        (targetItemId === itemId ? routeNode : undefined) ??
        (fallbackSessionItem ? toTreeNode(fallbackSessionItem) : undefined)
      const powerStatus = resolvePowerStatus(targetItemId, node)
      return resolveConsoleTarget(targetItemId, node, powerStatus)
    },
    [
      retainedFallbackItem,
      retainedItemId,
      getItemData,
      itemId,
      routeNode,
      resolvePowerStatus,
    ]
  )

  const buildTargetRef = useRef(buildTarget)
  useEffect(() => {
    buildTargetRef.current = buildTarget
  }, [buildTarget])

  const handleStatusChange = useCallback(
    (targetItemId: string, status: VncConnectionStatus) => {
      setRetainedSession((prev) => {
        if (isRetainedStatus(status)) {
          const existing = prev?.itemId === targetItemId ? prev : null
          const target =
            buildTargetRef.current(targetItemId) ?? existing?.target
          if (!target) {
            return prev
          }
          return { itemId: targetItemId, target, status }
        }

        if (prev?.itemId !== targetItemId) {
          return prev
        }
        return null
      })
    },
    []
  )

  const getRetentionState = useCallback(
    (targetItemId: string): RetentionState => {
      const retainedTreeNode = getItemData(targetItemId)
      if (retainedTreeNode) {
        return resolveConsoleTarget(targetItemId, retainedTreeNode, undefined)
          ? "valid"
          : "invalid"
      }

      if (targetItemId === retainedItemId && retainedFallbackItem) {
        const fallbackNode = toTreeNode(retainedFallbackItem)
        return resolveConsoleTarget(targetItemId, fallbackNode, undefined)
          ? "valid"
          : "invalid"
      }

      if (
        targetItemId === retainedItemId &&
        needsRetainedFallback &&
        retainedFallbackError &&
        isApiErrorStatus(retainedFallbackError, 404)
      ) {
        return "invalid"
      }

      if (targetItemId === retainedItemId && needsRetainedFallback) {
        return "unknown"
      }

      return "unknown"
    },
    [
      getItemData,
      needsRetainedFallback,
      retainedFallbackError,
      retainedFallbackItem,
      retainedItemId,
    ]
  )

  const retainEligibility = retainedItemId
    ? `${retainedItemId}:${getRetentionState(retainedItemId)}`
    : ""

  useEffect(() => {
    if (isTreeLoading || treeError || !retainedItemId) {
      return
    }

    if (getRetentionState(retainedItemId) === "invalid") {
      setRetainedSession(null)
    }
  }, [retainEligibility, getRetentionState, isTreeLoading, retainedItemId, treeError])

  const panels = useMemo(() => {
    const nextPanels: Array<ConsolePanel> = []
    const seenIds = new Set<string>()

    if (retainedSession) {
      const isActive = activeTarget?.itemId === retainedSession.itemId
      if (
        isActive ||
        treeError ||
        isTreeLoading ||
        getRetentionState(retainedSession.itemId) !== "invalid"
      ) {
        const freshTarget = buildTarget(retainedSession.itemId)
        const target = freshTarget
          ? { ...retainedSession.target, ...freshTarget }
          : retainedSession.target

        nextPanels.push({
          itemId: retainedSession.itemId,
          target,
          isActive,
        })
        seenIds.add(retainedSession.itemId)
      }
    }

    if (activeTarget && !seenIds.has(activeTarget.itemId)) {
      nextPanels.push({
        itemId: activeTarget.itemId,
        target: activeTarget,
        isActive: true,
      })
    }

    return nextPanels
  }, [
    retainedSession,
    activeTarget,
    buildTarget,
    getRetentionState,
    isTreeLoading,
    treeError,
  ])

  const isDocumentVisible = useSyncExternalStore(
    subscribeToDocumentVisibility,
    getDocumentVisibility,
    getServerDocumentVisibility
  )

  const activeRetainedStatus =
    activeTarget && retainedSession?.itemId === activeTarget.itemId
      ? retainedSession.status
      : null

  const shouldPinActiveConsole =
    activeTarget !== null && isPinnedConsoleStatus(activeRetainedStatus)

  const setPinnedItemId = useVncSessionVisibilityPublisher()
  const publishedPinnedItemId = shouldPinActiveConsole
    ? activeTarget.itemId
    : null

  useEffect(() => {
    setPinnedItemId(publishedPinnedItemId)

    return () => {
      setPinnedItemId((current) =>
        current === publishedPinnedItemId ? null : current
      )
    }
  }, [publishedPinnedItemId, setPinnedItemId])

  if (panels.length === 0) {
    return null
  }

  return (
    <div
      data-testid="vnc-session-workspace"
      data-pinned={shouldPinActiveConsole ? "true" : "false"}
      className={cn(
        "grid grid-cols-1",
        shouldPinActiveConsole
          ? "absolute inset-x-0 bottom-0 top-0 z-20 overflow-y-auto bg-background px-4 pt-4 pb-4 md:pt-6 md:pb-6 lg:px-6"
          : activeTarget
            ? "px-4 pb-4 md:pb-6 lg:px-6"
            : "fixed inset-0 invisible pointer-events-none"
      )}
      aria-hidden={activeTarget ? undefined : true}
      inert={activeTarget ? undefined : true}
    >
      {panels.map((panel) => (
        <VncSessionPanel
          key={panel.itemId}
          panel={panel}
          isViewed={panel.isActive && isDocumentVisible}
          onStatusChange={handleStatusChange}
        />
      ))}
    </div>
  )
}

function VncSessionPanel({
  panel,
  isViewed,
  onStatusChange,
}: {
  panel: ConsolePanel
  isViewed: boolean
  onStatusChange: (itemId: string, status: VncConnectionStatus) => void
}) {
  const handleStatusChange = useCallback(
    (status: VncConnectionStatus) => onStatusChange(panel.itemId, status),
    [onStatusChange, panel.itemId]
  )

  return (
    <div
      className={cn(
        "col-start-1 row-start-1 min-w-0",
        !panel.isActive && "invisible pointer-events-none"
      )}
      aria-hidden={!panel.isActive}
      inert={!panel.isActive}
      data-testid={`vnc-panel-${panel.itemId}`}
      data-active={panel.isActive ? "true" : "false"}
    >
      <VncConsole
        itemId={panel.target.itemId}
        guestType={panel.target.guestType}
        powerStatus={panel.target.powerStatus}
        vmName={panel.target.vmName}
        vmid={panel.target.vmid}
        isViewed={isViewed}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}
