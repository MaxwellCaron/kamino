import {
  InventoryPermissionBits,
  InventoryPermissionKeys,
} from "./inventory-permissions"
import { describe, expect, it } from "vitest"
import type { ApiTreeNode } from "./inventory-types"
import { getInventoryFolderOptions } from "./inventory-tree"

function folderNode(
  id: string,
  name: string,
  allowedMask: number,
  children: Array<ApiTreeNode> = []
): ApiTreeNode {
  return {
    id,
    name,
    kind: "folder",
    permissions: {
      allowed_mask: allowedMask,
      denied_mask: 0,
      request_mask: 0,
    },
    children,
  }
}

const viewAndCreateMask =
  InventoryPermissionBits.view | InventoryPermissionBits.createVm
const viewOnlyMask = InventoryPermissionBits.view

const tree: Array<ApiTreeNode> = [
  folderNode("root", "Inventory", 0, [
    folderNode("folder-b", "Bravo", viewOnlyMask),
    folderNode("folder-a", "Alpha", viewAndCreateMask),
    folderNode("nested-root", "Nested", viewAndCreateMask, [
      folderNode("folder-c", "Charlie", viewAndCreateMask),
    ]),
  ]),
]

describe("getInventoryFolderOptions", () => {
  it("returns visible folders sorted by full path, excluding the inventory root", () => {
    const options = getInventoryFolderOptions(tree)
    const labels = options.map((option) => option.label)

    expect(labels).toEqual(["Alpha", "Bravo", "Nested", "Nested / Charlie"])
  })

  it("filters to Create VM folders when requested", () => {
    const options = getInventoryFolderOptions(
      tree,
      InventoryPermissionKeys.createVm
    )
    const labels = options.map((option) => option.label)

    expect(labels).toEqual(["Alpha", "Nested", "Nested / Charlie"])
    expect(labels).not.toContain("Bravo")
  })
})
