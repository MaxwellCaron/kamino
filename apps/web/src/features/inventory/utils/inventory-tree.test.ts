import { describe, expect, it } from "vitest"
import {
  
  getInventoryFolderOptions
} from "./inventory-tree"
import {
  InventoryPermissionBits,
  InventoryPermissionKeys,
} from "./inventory-permissions"
import type {InventoryFolderOption} from "./inventory-tree";
import type { ApiTreeNode } from "../types/inventory-types"

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
    folderNode("folder-a", "Alpha", viewAndCreateMask),
    folderNode("folder-b", "Bravo", viewOnlyMask),
    folderNode("nested-root", "Nested", viewAndCreateMask, [
      folderNode("folder-c", "Charlie", viewAndCreateMask),
    ]),
  ]),
]

describe("getInventoryFolderOptions", () => {
  it("includes visible folders by default", () => {
    const options = getInventoryFolderOptions(tree)
    const labels = options.map((option) => option.label)

    expect(labels).toContain("Alpha")
    expect(labels).toContain("Bravo")
    expect(labels).toContain("Nested / Charlie")
    expect(labels).not.toContain("Inventory")
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

  it("excludes the inventory root folder", () => {
    const options = getInventoryFolderOptions(tree)
    expect(options.some((option) => option.name === "Inventory")).toBe(false)
  })

  it("sorts folders by full path label", () => {
    const options = getInventoryFolderOptions(tree)
    const labels = options.map((option: InventoryFolderOption) => option.label)

    expect(labels).toEqual(["Alpha", "Bravo", "Nested", "Nested / Charlie"])
  })
})
