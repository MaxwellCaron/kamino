import type { ApiTreeNode, SelectedVmItem } from "../../types/inventory-types"

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function getVmSelectionLabel(items: Array<SelectedVmItem>) {
  const templateCount = items.filter((item) => item.vm.is_template).length
  const vmCount = items.length - templateCount

  if (templateCount === 0) {
    return pluralize(vmCount, "VM")
  }

  if (vmCount === 0) {
    return pluralize(templateCount, "template")
  }

  return `${pluralize(vmCount, "VM")} and ${pluralize(templateCount, "template")}`
}

export function collectDescendantIds(
  node: ApiTreeNode,
  descendants: Set<string>
) {
  for (const child of node.children ?? []) {
    descendants.add(child.id)
    collectDescendantIds(child, descendants)
  }
}
