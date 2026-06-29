import type { IconSvgElement } from "@hugeicons/react"
import type {
  ClonedPod,
  PublishedPodCatalogEntry,
} from "@/features/pods/types/pod-types"

export type ClonedPodEntry = {
  clonedPod: ClonedPod
  pod: PublishedPodCatalogEntry
}

export type DashboardStat = {
  icon: IconSvgElement
  label: string
  value: string
}
