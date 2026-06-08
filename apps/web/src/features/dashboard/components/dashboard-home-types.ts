import type { Icon } from "@tabler/icons-react"
import type {
  ClonedPod,
  PublishedPodCatalogEntry,
} from "@/features/pods/types/pod-types"

export type ClonedPodEntry = {
  clonedPod: ClonedPod
  pod: PublishedPodCatalogEntry
}

export type DashboardStat = {
  icon: Icon
  label: string
  value: string
}
