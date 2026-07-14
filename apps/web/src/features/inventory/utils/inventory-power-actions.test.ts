import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  collectFolderPowerTargets,
  runInventoryPowerAction,
} from "./inventory-power-actions"
import { InventoryPermissionBits } from "./inventory-permissions"
import type { ApiTreeNode, SelectedVmItem } from "../types/inventory-types"
import type { QueryClient } from "@tanstack/react-query"
import { vmPowerAction } from "@/features/vms/api/vm-api"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"

vi.mock("@/features/vms/api/vm-api", () => ({
  vmPowerAction: vi.fn(),
  vmStatusQueryOptions: { queryKey: ["vm-status"] },
}))

vi.mock("@/components/feedback/mutation-progress-toast", () => ({
  showUnitMutationToast: vi.fn(),
}))

const powerVmMask = InventoryPermissionBits.powerVm
const viewMask = InventoryPermissionBits.view

function vmNode(
  id: string,
  name: string,
  allowedMask: number,
  isTemplate = false
): ApiTreeNode {
  return {
    id,
    name,
    kind: "vm",
    permissions: {
      allowed_mask: allowedMask,
      denied_mask: 0,
      request_mask: 0,
    },
    vm: {
      node: "pve1",
      vmid: Number(id.replace(/\D/g, "")) || 100,
      guest_type: "qemu",
      is_template: isTemplate,
    },
  }
}

function folderNode(
  id: string,
  name: string,
  children: Array<ApiTreeNode> = []
): ApiTreeNode {
  return {
    id,
    name,
    kind: "folder",
    permissions: {
      allowed_mask: viewMask,
      denied_mask: 0,
      request_mask: 0,
    },
    children,
  }
}

function makeTarget(id: string): SelectedVmItem {
  return {
    id,
    name: `VM ${id}`,
    kind: "vm",
    permissions: { allowed_mask: 0, denied_mask: 0, request_mask: 0 },
    vm: {
      node: "pve1",
      vmid: 100,
      guest_type: "qemu",
      is_template: false,
    },
  }
}

describe("collectFolderPowerTargets", () => {
  it("collects non-template VMs in the folder subtree when all have powerVm", () => {
    const tree = [
      folderNode("folder-1", "Lab", [
        vmNode("vm-1", "VM One", powerVmMask),
        folderNode("subfolder-1", "Nested", [
          vmNode("vm-2", "VM Two", powerVmMask),
        ]),
      ]),
    ]

    const result = collectFolderPowerTargets(tree, "folder-1")

    expect(result.targets).toHaveLength(2)
    expect(result.targets.map((item) => item.id).sort()).toEqual([
      "vm-1",
      "vm-2",
    ])
    expect(result.canPower).toBe(true)
  })

  it("returns canPower false when any VM lacks direct powerVm permission", () => {
    const tree = [
      folderNode("folder-1", "Lab", [
        vmNode("vm-1", "VM One", powerVmMask),
        vmNode("vm-2", "VM Two", viewMask),
      ]),
    ]

    const result = collectFolderPowerTargets(tree, "folder-1")

    expect(result.targets).toHaveLength(2)
    expect(result.canPower).toBe(false)
  })

  it("excludes template-only folders from targets", () => {
    const tree = [
      folderNode("folder-1", "Templates", [
        vmNode("vm-tpl", "Template VM", powerVmMask, true),
      ]),
    ]

    const result = collectFolderPowerTargets(tree, "folder-1")

    expect(result.targets).toHaveLength(0)
    expect(result.canPower).toBe(false)
  })

  it("excludes templates but includes permitted VMs alongside them", () => {
    const tree = [
      folderNode("folder-1", "Mixed", [
        vmNode("vm-tpl", "Template VM", powerVmMask, true),
        vmNode("vm-1", "VM One", powerVmMask),
      ]),
    ]

    const result = collectFolderPowerTargets(tree, "folder-1")

    expect(result.targets).toHaveLength(1)
    expect(result.targets[0]?.id).toBe("vm-1")
    expect(result.canPower).toBe(true)
  })

  it("returns empty targets when folder id is missing or not a folder", () => {
    const tree = [
      folderNode("folder-1", "Lab", [vmNode("vm-1", "VM One", powerVmMask)]),
    ]

    expect(collectFolderPowerTargets(tree, "missing")).toEqual({
      targets: [],
      canPower: false,
    })
    expect(collectFolderPowerTargets(tree, "vm-1")).toEqual({
      targets: [],
      canPower: false,
    })
  })
})

describe("runInventoryPowerAction", () => {
  const queryClient = {
    invalidateQueries: vi.fn(),
  } as unknown as QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(showUnitMutationToast).mockImplementation(({ onSettled }) => {
      onSettled?.({ succeeded: [], failed: [] })
      return "toast-id"
    })
  })

  it("sends one request with all selected VM ids", async () => {
    vi.mocked(vmPowerAction).mockResolvedValue({
      succeeded: ["vm-1", "vm-2"],
      failed: [],
    })

    runInventoryPowerAction({
      queryClient,
      action: "start",
      targets: [makeTarget("vm-1"), makeTarget("vm-2")],
    })

    const config = vi.mocked(showUnitMutationToast).mock.calls[0][0]
    expect(config.units).toHaveLength(1)
    await config.units[0].run(async () => {})

    expect(vmPowerAction).toHaveBeenCalledWith({
      action: "start",
      itemIds: ["vm-1", "vm-2"],
    })
  })

  it("maps API failures and exposes one-id retry", async () => {
    vi.mocked(vmPowerAction).mockResolvedValue({
      succeeded: ["vm-1"],
      failed: [{ id: "vm-2", error: "start failed" }],
    })

    runInventoryPowerAction({
      queryClient,
      action: "start",
      targets: [makeTarget("vm-1"), makeTarget("vm-2")],
    })

    const config = vi.mocked(showUnitMutationToast).mock.calls[0][0]
    const items = config.units[0].items
    expect(items).toHaveLength(2)
    expect(items[0].retry).toBeTypeOf("function")
    expect(items[1].retry).toBeTypeOf("function")

    const result = await config.units[0].run(async () => {})
    expect(result).toEqual({
      failed: [{ id: "vm-2", error: "start failed" }],
    })
  })
})
