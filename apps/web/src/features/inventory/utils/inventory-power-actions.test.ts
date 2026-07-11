import { describe, expect, it } from "vitest"
import { collectFolderPowerTargets } from "./inventory-power-actions"
import { InventoryPermissionBits } from "./inventory-permissions"
import type { ApiTreeNode } from "../types/inventory-types"

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
