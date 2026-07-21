import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useParams } from "@tanstack/react-router"
import { useQueries, useQuery } from "@tanstack/react-query"
import { cn } from "@workspace/ui/lib/utils"

import type {
  ApiInventoryItem,
  ApiTreeNode,
} from "@/features/inventory/types/inventory-types"
import type { VncConnectionStatus } from "@/features/vms/components/dashboard/vnc-console"
import { inventoryItemQueryOptions } from "@/features/inventory/api/inventory-api"
import { useInventoryTreeContext } from "@/features/inventory/components/tree/inventory-tree-context"
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
  } = useInventoryTreeContext()
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

  const [sessions, setSessions] = useState<Map<string, RetainedSession>>(
    () => new Map()
  )

  const fallbackSessionIds = useMemo(
    () => [...sessions.keys()].filter((id) => !getItemData(id)),
    [getItemData, sessions]
  )
  const fallbackSessionQueries = useQueries({
    queries: fallbackSessionIds.map((id) => inventoryItemQueryOptions(id)),
  })
  const fallbackSessionResults = useMemo(
    () =>
      new Map(
        fallbackSessionIds.map((id, index) => [
          id,
          fallbackSessionQueries[index],
        ])
      ),
    [fallbackSessionIds, fallbackSessionQueries]
  )

  const buildTarget = useCallback(
    (targetItemId: string): ConsoleTarget | null => {
      const fallbackSessionItem = fallbackSessionResults.get(targetItemId)?.data
      const node =
        getItemData(targetItemId) ??
        (targetItemId === itemId ? routeNode : undefined) ??
        (fallbackSessionItem ? toTreeNode(fallbackSessionItem) : undefined)
      const powerStatus = resolvePowerStatus(targetItemId, node)
      return resolveConsoleTarget(targetItemId, node, powerStatus)
    },
    [fallbackSessionResults, getItemData, itemId, routeNode, resolvePowerStatus]
  )

  const buildTargetRef = useRef(buildTarget)
  useEffect(() => {
    buildTargetRef.current = buildTarget
  }, [buildTarget])

  const handleStatusChange = useCallback(
    (targetItemId: string, status: VncConnectionStatus) => {
      setSessions((prev) => {
        if (isRetainedStatus(status)) {
          const existing = prev.get(targetItemId)
          const target =
            buildTargetRef.current(targetItemId) ?? existing?.target
          if (!target) {
            return prev
          }
          const next = new Map(prev)
          next.set(targetItemId, { target, status })
          return next
        }

        if (!prev.has(targetItemId)) {
          return prev
        }
        const next = new Map(prev)
        next.delete(targetItemId)
        return next
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

      const fallbackResult = fallbackSessionResults.get(targetItemId)
      if (fallbackResult?.data) {
        const fallbackNode = toTreeNode(fallbackResult.data)
        return resolveConsoleTarget(targetItemId, fallbackNode, undefined)
          ? "valid"
          : "invalid"
      }

      if (
        fallbackResult?.isError &&
        isApiErrorStatus(fallbackResult.error, 404)
      ) {
        return "invalid"
      }

      return "unknown"
    },
    [fallbackSessionResults, getItemData]
  )

  const retainEligibility = [...sessions.keys()]
    .map((id) => `${id}:${getRetentionState(id)}`)
    .join(",")

  useEffect(() => {
    if (isTreeLoading || treeError) {
      return
    }

    setSessions((prev) => {
      let changed = false
      const next = new Map(prev)

      for (const id of prev.keys()) {
        if (getRetentionState(id) === "invalid") {
          next.delete(id)
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [retainEligibility, getRetentionState, isTreeLoading, treeError])

  const panels = useMemo(() => {
    const itemIds = new Set(sessions.keys())
    if (activeTarget) {
      itemIds.add(activeTarget.itemId)
    }

    const nextPanels: Array<ConsolePanel> = []

    for (const panelItemId of itemIds) {
      const isActive = activeTarget?.itemId === panelItemId
      if (!isActive) {
        if (!sessions.has(panelItemId)) {
          continue
        }
        if (
          !treeError &&
          !isTreeLoading &&
          getRetentionState(panelItemId) === "invalid"
        ) {
          continue
        }
      }

      const retained = sessions.get(panelItemId)
      const freshTarget = buildTarget(panelItemId)
      const target = freshTarget
        ? { ...retained?.target, ...freshTarget }
        : retained?.target

      if (!target) {
        continue
      }

      nextPanels.push({
        itemId: panelItemId,
        target,
        isActive,
      })
    }

    return nextPanels
  }, [
    sessions,
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
    activeTarget && sessions.has(activeTarget.itemId)
      ? (sessions.get(activeTarget.itemId)?.status ?? null)
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
