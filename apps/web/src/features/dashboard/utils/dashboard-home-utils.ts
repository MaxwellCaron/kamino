import type { Activity } from "@workspace/ui/components/kibo-ui/contribution-graph"
import type { ClonedPodEntry } from "../components/dashboard-home-types"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"

export function countVmStatusSummary(
  inventoryItemsById: Map<string, ApiTreeNode>,
  vmStatuses: Record<number, string> | undefined
) {
  let running = 0
  let stopped = 0
  let templates = 0

  for (const item of inventoryItemsById.values()) {
    if (item.kind !== "vm" || !item.vm) continue

    if (item.vm.is_template) {
      templates += 1
      continue
    }

    if (vmStatuses?.[item.vm.vmid] === "running") {
      running += 1
    } else {
      stopped += 1
    }
  }

  return { running, stopped, templates }
}

export function toTime(value: string | null | undefined) {
  return value ? new Date(value).getTime() : 0
}

export function buildQuestionActivityData(entries: Array<ClonedPodEntry>) {
  const today = new Date()
  const startDate = new Date(
    today.getFullYear(),
    today.getMonth() - 6,
    today.getDate()
  )
  const todayKey = toLocalDateKey(today)
  const startDateKey = toLocalDateKey(startDate)
  const countsByDate = new Map<string, number>()

  for (const entry of entries) {
    for (const answer of entry.clonedPod.question_answers) {
      const answeredAt = new Date(answer.answered_at)
      const dateKey = toLocalDateKey(answeredAt)

      if (
        Number.isNaN(answeredAt.getTime()) ||
        dateKey < startDateKey ||
        dateKey > todayKey
      ) {
        continue
      }

      countsByDate.set(dateKey, (countsByDate.get(dateKey) ?? 0) + 1)
    }
  }

  const data: Array<Activity> = []
  for (
    let date = new Date(startDate);
    toLocalDateKey(date) <= todayKey;
    date.setDate(date.getDate() + 1)
  ) {
    const dateKey = toLocalDateKey(date)
    const count = countsByDate.get(dateKey) ?? 0
    data.push({
      date: dateKey,
      count,
      level: getQuestionActivityLevel(count),
    })
  }

  return data
}

function getQuestionActivityLevel(count: number) {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  if (count <= 4) return 3
  return 4
}

function toLocalDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${date.getFullYear()}-${month}-${day}`
}
