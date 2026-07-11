import { hasDirectInventoryCapability } from "./inventory-capabilities"
import { findInventoryTreeNode } from "./inventory-tree"
import type { QueryClient } from "@tanstack/react-query"
import type { ApiTreeNode, SelectedVmItem } from "../types/inventory-types"
import type { MutationResult } from "@/components/feedback/mutation-progress-toast"
import { formatVmReference } from "@/features/shared/utils/format"
import { vmPowerAction, vmStatusQueryOptions } from "@/features/vms/api/vm-api"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"

export type InventoryPowerAction = "start" | "shutdown" | "reboot" | "stop"

export type FolderPowerTargets = {
  targets: Array<SelectedVmItem>
  canPower: boolean
}

const VM_STATUS_POLL_INTERVAL_MS = 2_000

function startVmStatusPolling(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: vmStatusQueryOptions.queryKey })
  const handle = window.setInterval(() => {
    void queryClient.invalidateQueries({
      queryKey: vmStatusQueryOptions.queryKey,
    })
  }, VM_STATUS_POLL_INTERVAL_MS)
  return () => window.clearInterval(handle)
}

export function collectPowerVmTargets(
  node: ApiTreeNode,
  targets: Map<string, SelectedVmItem>
) {
  if (node.kind === "vm" && node.vm && !node.vm.is_template) {
    targets.set(node.id, node as SelectedVmItem)
    return
  }

  for (const child of node.children ?? []) {
    collectPowerVmTargets(child, targets)
  }
}

export function collectFolderPowerTargets(
  tree: Array<ApiTreeNode>,
  folderId: string
): FolderPowerTargets {
  const folder = findInventoryTreeNode(tree, folderId)
  if (!folder || folder.kind !== "folder") {
    return { targets: [], canPower: false }
  }

  const targetMap = new Map<string, SelectedVmItem>()
  collectPowerVmTargets(folder, targetMap)
  const targets = Array.from(targetMap.values())

  return {
    targets,
    canPower:
      targets.length > 0 &&
      targets.every((item) =>
        hasDirectInventoryCapability(item.permissions, "powerVm")
      ),
  }
}

export function runInventoryPowerAction({
  queryClient,
  action,
  targets,
  onSettled,
}: {
  queryClient: QueryClient
  action: InventoryPowerAction
  targets: Array<SelectedVmItem>
  onSettled?: (result: MutationResult) => void
}) {
  const targetItemIds = targets.map((item) => item.id)

  if (targetItemIds.length === 0) {
    return
  }

  const actionLabels = {
    start: { loading: "Starting", failure: "Failed to start selected VMs" },
    shutdown: {
      loading: "Shutting down",
      failure: "Failed to shut down selected VMs",
    },
    reboot: {
      loading: "Rebooting",
      failure: "Failed to reboot selected VMs",
    },
    stop: { loading: "Stopping", failure: "Failed to stop selected VMs" },
  }[action]

  const stopPolling = startVmStatusPolling(queryClient)

  showUnitMutationToast({
    title: `${actionLabels.loading} ${targetItemIds.length} VM${targetItemIds.length === 1 ? "" : "s"}`,
    units: targets.map((item) => ({
      items: [
        {
          id: item.id,
          name: formatVmReference(item.vm.vmid, item.name),
        },
      ],
      run: async () => {
        try {
          const result = await vmPowerAction({
            action,
            itemIds: [item.id],
          })
          if (result.succeeded.length > 0) {
            void queryClient.invalidateQueries({
              queryKey: vmStatusQueryOptions.queryKey,
            })
          }
          return { failed: result.failed }
        } catch (error) {
          return {
            failed: [
              {
                id: item.id,
                error:
                  error instanceof Error
                    ? error.message
                    : actionLabels.failure,
              },
            ],
          }
        }
      },
    })),
    onSettled: (result) => {
      stopPolling()
      void queryClient.invalidateQueries({
        queryKey: vmStatusQueryOptions.queryKey,
      })
      onSettled?.(result)
    },
  })
}
