import { useState } from "react"
import { ArrowUpRightIcon, PlusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { PersonalPodStatus } from "@/features/pods/api/personal-pod-api"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  createPersonalPod,
  personalPodQueryOptions,
  requestPersonalPod,
} from "@/features/pods/api/personal-pod-api"
import { requesterRequestSummariesQueryOptions } from "@/features/requests/api/requests-api"
import { KaminoGrainient } from "@/components/grainient-background"

export function PersonalPodCard({
  status,
  username,
}: {
  status: PersonalPodStatus
  username?: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null)

  if (!status.configured) {
    return null
  }

  const existingPersonalPod = status.personal_pod
  const isPending = status.pending_request_id !== null
  const canCreate = status.can_create

  const cardMeta = existingPersonalPod
    ? {
        description:
          "Open your personal pod folder and continue where you left off.",
        footerLabel: existingPersonalPod.network.vnet,
        action: (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              router.navigate({
                to: "/inventory/items/$itemId",
                params: { itemId: existingPersonalPod.folder_id },
              })
            }
          >
            Open
            <HugeiconsIcon icon={ArrowUpRightIcon} data-icon="inline-end" />
          </Button>
        ),
      }
    : isPending
      ? {
          description: "Your personal pod request is pending approval.",
          footerLabel: "Request submitted",
          action: (
            <Button size="sm" disabled>
              Open
              <HugeiconsIcon icon={ArrowUpRightIcon} data-icon="inline-end" />
            </Button>
          ),
        }
      : canCreate
        ? {
            description:
              "Provision a personal folder with a router and a reserved network.",
            action: (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setConfirmConfig({
                    title: "Create Personal Pod",
                    description:
                      "Provision a personal folder with a router and a reserved network.",
                    actionLabel: "Create",
                    onConfirm: () => {
                      showSingleMutationToast({
                        title: "Creating Personal Pod",
                        name: username ?? "Personal Pod",
                        promise: async () => {
                          const result = await createPersonalPod()
                          await Promise.all([
                            queryClient.invalidateQueries({
                              queryKey: personalPodQueryOptions.queryKey,
                            }),
                            queryClient.refetchQueries({
                              queryKey: inventoryTreeQueryOptions.queryKey,
                              type: "all",
                            }),
                          ])
                          router.navigate({
                            to: "/inventory/items/$itemId",
                            params: { itemId: result.folder_id },
                          })
                          return result
                        },
                        successDescription: "Created",
                      })
                    },
                  })
                }
              >
                <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
                Create
              </Button>
            ),
          }
        : {
            description:
              "Request a personal folder with a router and a reserved network.",
            action: (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setConfirmConfig({
                    title: "Request Personal Pod",
                    description:
                      "Submit a request for a personal folder with a router and a reserved network.",
                    actionLabel: "Request",
                    onConfirm: () => {
                      showSingleMutationToast({
                        title: "Requesting Personal Pod",
                        name: username ?? "Personal Pod",
                        promise: async () => {
                          const result = await requestPersonalPod()
                          await Promise.all([
                            queryClient.invalidateQueries({
                              queryKey: personalPodQueryOptions.queryKey,
                            }),
                            queryClient.invalidateQueries({
                              queryKey:
                                requesterRequestSummariesQueryOptions("pending")
                                  .queryKey,
                            }),
                          ])
                          return result
                        },
                        successDescription: "Requested",
                      })
                    },
                  })
                }
              >
                <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
                Request
              </Button>
            ),
          }

  return (
    <>
      <Item variant="muted">
        <ItemMedia variant="image" className="size-15">
          <KaminoGrainient />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Personal Pod</ItemTitle>
          <ItemDescription>{cardMeta.description}</ItemDescription>
          {cardMeta.footerLabel && (
            <Badge variant="outline">{cardMeta.footerLabel}</Badge>
          )}
        </ItemContent>
        <ItemActions>{cardMeta.action}</ItemActions>
      </Item>
      <ConfirmDialog
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </>
  )
}
