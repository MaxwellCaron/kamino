import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { useParams, useRouterState } from "@tanstack/react-router"
import { useQueries, useQuery } from "@tanstack/react-query"

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
import { isApiErrorStatus } from "@/features/auth/api/auth-api"

type ConsoleTarget = {
  itemId: string
  powerStatus: string | undefined
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
    powerStatus,
  }
}

function isRetainedStatus(status: VncConnectionStatus): boolean {
  return (
    status === "connecting" || status === "connected" || status === "expired"
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
  const href = useRouterState({ select: (state) => state.location.href })
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

  const visiblePanelRef = useRef<HTMLDivElement>(null)
  const lastScrollKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeTarget) {
      lastScrollKeyRef.current = null
      return
    }

    const retained = sessions.get(activeTarget.itemId)
    if (retained?.status !== "connected" && retained?.status !== "expired") {
      return
    }

    const scrollKey = `${href}:${activeTarget.itemId}`
    if (lastScrollKeyRef.current === scrollKey) {
      return
    }

    const frameId = requestAnimationFrame(() => {
      visiblePanelRef.current?.scrollIntoView({
        block: "center",
        behavior: "auto",
      })
      lastScrollKeyRef.current = scrollKey
    })

    return () => cancelAnimationFrame(frameId)
  }, [activeTarget, href, sessions])

  if (panels.length === 0) {
    return null
  }

  return (
    <div
      hidden={!activeTarget}
      className={
        activeTarget
          ? "flex flex-col gap-4 px-4 pb-4 md:gap-6 md:pb-6 lg:px-6"
          : undefined
      }
    >
      {panels.map((panel) => (
        <VncSessionPanel
          key={panel.itemId}
          panel={panel}
          panelRef={panel.isActive ? visiblePanelRef : undefined}
          isViewed={panel.isActive && isDocumentVisible}
          onStatusChange={handleStatusChange}
        />
      ))}
    </div>
  )
}

function VncSessionPanel({
  panel,
  panelRef,
  isViewed,
  onStatusChange,
}: {
  panel: ConsolePanel
  panelRef: React.Ref<HTMLDivElement> | undefined
  isViewed: boolean
  onStatusChange: (itemId: string, status: VncConnectionStatus) => void
}) {
  const handleStatusChange = useCallback(
    (status: VncConnectionStatus) => onStatusChange(panel.itemId, status),
    [onStatusChange, panel.itemId]
  )

  return (
    <div
      ref={panelRef}
      hidden={!panel.isActive}
      aria-hidden={!panel.isActive}
      inert={!panel.isActive}
      data-testid={`vnc-panel-${panel.itemId}`}
      data-active={panel.isActive ? "true" : "false"}
    >
      <VncConsole
        itemId={panel.target.itemId}
        powerStatus={panel.target.powerStatus}
        isViewed={isViewed}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}
