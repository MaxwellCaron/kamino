import { useState } from "react"
import {
  ArrowUpRightIcon,
  PackageIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
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

const PERSONAL_POD_DESCRIPTION =
  "Provisions you a personal folder along with a pre-configured router, allowing you to easily set up and manage your own virtual machines."

export function PersonalPodCard({
  className,
  status,
  username,
}: {
  className?: string
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
        description: PERSONAL_POD_DESCRIPTION,
        footerLabel:
          existingPersonalPod.network.lan_vlan_tag == null
            ? existingPersonalPod.network.vnet
            : `VLAN ${existingPersonalPod.network.lan_vlan_tag}`,
        action: (
          <Button
            type="button"
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
          description: PERSONAL_POD_DESCRIPTION,
          action: (
            <Button disabled>
              Requested
              <HugeiconsIcon icon={ArrowUpRightIcon} data-icon="inline-end" />
            </Button>
          ),
        }
      : canCreate
        ? {
            description: PERSONAL_POD_DESCRIPTION,
            action: (
              <Button
                type="button"
                onClick={() =>
                  setConfirmConfig({
                    title: "Create Personal Pod",
                    description: PERSONAL_POD_DESCRIPTION,
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
            description: PERSONAL_POD_DESCRIPTION,
            action: (
              <Button
                type="button"
                onClick={() =>
                  setConfirmConfig({
                    title: "Request Personal Pod",
                    description: "Submit a request for a personal folder.",
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
      {isPending ? (
        <span className="sr-only" role="status" aria-live="polite">
          Personal pod request pending
        </span>
      ) : null}
      <Card className={cn(className)}>
        <CardHeader className="flex flex-row items-center gap-4">
          <div className="relative size-18 shrink-0 overflow-hidden rounded-3xl">
            <div className="absolute inset-0 opacity-75">
              <KaminoGrainient />
            </div>
            <HugeiconsIcon
              icon={PackageIcon}
              className="absolute inset-0 m-auto size-8 text-white drop-shadow-sm"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <CardTitle className="line-clamp-1 scroll-m-20 text-2xl font-semibold tracking-tight">
              Personal Pod
              {cardMeta.footerLabel && (
                <span className="text-muted-foreground">{` - ${cardMeta.footerLabel}`}</span>
              )}
            </CardTitle>
            <CardDescription>{cardMeta.description}</CardDescription>
          </div>
          <CardAction className="static self-center">
            {cardMeta.action}
          </CardAction>
        </CardHeader>
      </Card>
      <ConfirmDialog
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </>
  )
}
