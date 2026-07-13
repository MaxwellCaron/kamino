import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { ChevronRightIcon, CopyIcon } from "@hugeicons/core-free-icons"
import { DropdownMenuItem } from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"
import type { PublishedPodCatalogEntry } from "@/features/pods/types/pod-types"
import type { QueryClient } from "@tanstack/react-query"
import { AppActionButton } from "@/components/actions/app-action-button"
import { publishedPodClonesQueryOptions } from "@/features/pods/api/publish-pod-api"

async function preparePublishedPodClones(
  queryClient: QueryClient,
  podId: string
) {
  const options = publishedPodClonesQueryOptions(podId)
  try {
    await queryClient.ensureQueryData(options)
  } catch {
    // Query error stays cached; expanded row renders InlineErrorAlert.
  }
}

type PublishedPodClonesDisclosureButtonProps = {
  pod: PublishedPodCatalogEntry
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
}

export function PublishedPodClonesDisclosureButton({
  pod,
  expanded,
  onExpandedChange,
}: PublishedPodClonesDisclosureButtonProps) {
  const queryClient = useQueryClient()
  const [isPreparing, setIsPreparing] = useState(false)

  const prefetch = () => {
    void queryClient.prefetchQuery(publishedPodClonesQueryOptions(pod.id))
  }

  const handleClick = async () => {
    if (expanded) {
      onExpandedChange(false)
      return
    }

    setIsPreparing(true)
    try {
      await preparePublishedPodClones(queryClient, pod.id)
      onExpandedChange(true)
    } finally {
      setIsPreparing(false)
    }
  }

  const ariaLabel = isPreparing
    ? `Loading cloned instances for ${pod.title}`
    : expanded
      ? `Hide cloned instances for ${pod.title}`
      : `Show cloned instances for ${pod.title}`

  return (
    <AppActionButton
      variant="ghost"
      size="icon-lg"
      aria-expanded={expanded}
      aria-label={ariaLabel}
      pending={isPreparing}
      pendingLabel={<span className="sr-only">Loading cloned instances</span>}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onClick={handleClick}
    >
      <HugeiconsIcon
        icon={ChevronRightIcon}
        data-icon="inline-start"
        className={cn(
          "transition-transform duration-150 ease-[cubic-bezier(0.77,0,0.175,1)]",
          expanded && "rotate-90"
        )}
      />
    </AppActionButton>
  )
}

type PublishedPodManagerCloneMenuItemProps = {
  pod: PublishedPodCatalogEntry
  disabled?: boolean
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onManagerClone: (pod: PublishedPodCatalogEntry) => void
}

export function PublishedPodManagerCloneMenuItem({
  pod,
  disabled,
  expanded,
  onExpandedChange,
  onManagerClone,
}: PublishedPodManagerCloneMenuItemProps) {
  const queryClient = useQueryClient()

  const prefetch = () => {
    void queryClient.prefetchQuery(publishedPodClonesQueryOptions(pod.id))
  }

  const handleClick = () => {
    onManagerClone(pod)
    if (!expanded) {
      void preparePublishedPodClones(queryClient, pod.id).then(() =>
        onExpandedChange(true)
      )
    }
  }

  return (
    <DropdownMenuItem
      disabled={disabled}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onClick={handleClick}
    >
      <HugeiconsIcon icon={CopyIcon} className="text-muted-foreground" />
      Clone
    </DropdownMenuItem>
  )
}
