import { defaultRangeExtractor } from "@tanstack/react-virtual"
import type { ApiTreeNode } from "../../types/inventory-types"
import type { Range } from "@tanstack/react-virtual"

export function mergeIndexIntoRange(
  rangeIndexes: Array<number>,
  extraIndex: number
): Array<number> {
  if (extraIndex < 0) {
    return [...rangeIndexes].sort((left, right) => left - right)
  }

  const merged = new Set(rangeIndexes)
  merged.add(extraIndex)
  return [...merged].sort((left, right) => left - right)
}

export function createTreeRangeExtractor(focusedIndex: number) {
  return (range: Range) =>
    mergeIndexIntoRange(defaultRangeExtractor(range), focusedIndex)
}

export interface InventoryTreeRowVm {
  id: string
  name: string
  kind: ApiTreeNode["kind"]
  level: number
  isFolder: boolean
  isExpanded: boolean
  isSelected: boolean
  isFocused: boolean
  isDragTarget: boolean
  isSearchMatch: boolean
  isFavorite: boolean
  status: string | undefined
  vmCount: number | null
  vmLimit: number | null
  canPower: boolean
  hasActions: boolean
}

export function upsertRowVm(
  cache: Map<string, InventoryTreeRowVm>,
  next: InventoryTreeRowVm
): InventoryTreeRowVm {
  const prev = cache.get(next.id)
  if (prev && rowVmEqual(prev, next)) {
    return prev
  }

  cache.set(next.id, next)
  return next
}

function rowVmEqual(a: InventoryTreeRowVm, b: InventoryTreeRowVm): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.kind === b.kind &&
    a.level === b.level &&
    a.isFolder === b.isFolder &&
    a.isExpanded === b.isExpanded &&
    a.isSelected === b.isSelected &&
    a.isFocused === b.isFocused &&
    a.isDragTarget === b.isDragTarget &&
    a.isSearchMatch === b.isSearchMatch &&
    a.isFavorite === b.isFavorite &&
    a.status === b.status &&
    a.vmCount === b.vmCount &&
    a.vmLimit === b.vmLimit &&
    a.canPower === b.canPower &&
    a.hasActions === b.hasActions
  )
}
