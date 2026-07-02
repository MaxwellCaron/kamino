import { useState } from "react"
import { m } from "motion/react"
import { PackageIcon, PinIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  CutoutCard,
  CutoutCardContent,
  CutoutCardFooter,
  CutoutCardInsetLabel,
  CutoutCardMedia,
  CutoutCardOverlay,
  CutoutCardPin,
  CutoutCorner,
  cutoutCardSurfaceClassName,
  useCutoutContentStaggerVariants,
} from "@workspace/ui/components/cutout-card"
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

export function PersonalPodCard({
  status,
  username,
}: {
  status: PersonalPodStatus
  username?: string
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const stagger = useCutoutContentStaggerVariants()
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null)

  if (!status.configured) {
    return null
  }

  const existingPersonalPod = status.personal_pod
  const isPending = status.pending_request_id !== null
  const canCreate = status.can_create

  const cardMeta = existingPersonalPod
    ? {
        label: "Ready",
        description:
          "Open your personal pod folder and continue where you left off.",
        footerLabel: `Pod ${existingPersonalPod.network.number}`,
        footerDetail: existingPersonalPod.network.vnet,
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
            Open Pod
          </Button>
        ),
      }
    : isPending
      ? {
          label: "Pending",
          description: "Your personal pod request is pending approval.",
          footerLabel: "Request submitted",
          footerDetail: "Awaiting review",
          action: <Badge variant="secondary">Pending</Badge>,
        }
      : canCreate
        ? {
            label: "Create",
            description:
              "Provision a personal folder with a router and a reserved network.",
            footerLabel: "Self-service",
            footerDetail: "Instant setup",
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
                            queryClient.invalidateQueries({
                              queryKey: inventoryTreeQueryOptions.queryKey,
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
                Create Pod
              </Button>
            ),
          }
        : {
            label: "Request",
            description:
              "Request a personal folder with a router and a reserved network.",
            footerLabel: "Approval required",
            footerDetail: "Managed workflow",
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
                Request Pod
              </Button>
            ),
          }

  return (
    <>
      <CutoutCard className={cutoutCardSurfaceClassName}>
        <CutoutCardMedia className="h-72 overflow-hidden bg-muted/40">
          <CutoutCardOverlay className="bg-amber-600/20 dark:bg-emerald-400/50" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex size-20 items-center justify-center rounded-full border border-border/60 bg-card/90 shadow-sm backdrop-blur-sm">
              <HugeiconsIcon icon={PackageIcon} className="text-foreground" />
            </div>
          </div>
          <CutoutCardInsetLabel className="bottom-0 left-0 rounded-tr-[20px] bg-card px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                {cardMeta.label}
              </span>
            </div>
            <CutoutCorner className="absolute -right-7.75 -bottom-px rotate-90 text-card" />
            <CutoutCorner className="absolute -top-7.75 -left-px rotate-90 text-card" />
          </CutoutCardInsetLabel>
          <CutoutCardPin className="top-0 right-0 rounded-bl-[16px] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md ring-1 shadow-foreground/10 ring-border/30">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={PinIcon} className="size-4" />
              Pinned
            </div>
            <CutoutCorner
              className="-left-5.7 absolute top-0 -rotate-90 text-primary"
              size={24}
            />
            <CutoutCorner
              className="absolute right-0 -bottom-5.75 -rotate-90 text-primary"
              size={24}
            />
          </CutoutCardPin>
        </CutoutCardMedia>
        <CutoutCardContent>
          <m.div
            animate="show"
            className="contents"
            initial="hidden"
            variants={stagger.container}
          >
            <m.h2
              className="mb-2 text-xl leading-snug font-semibold text-balance text-card-foreground"
              variants={stagger.item}
            >
              Personal Pod
            </m.h2>
            <m.p
              className="mb-4 text-sm leading-relaxed text-pretty text-muted-foreground"
              variants={stagger.item}
            >
              {cardMeta.description}
            </m.p>
            <m.div variants={stagger.item}>
              <CutoutCardFooter className="border-t border-border/80 pt-4">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-card-foreground">
                    {cardMeta.footerLabel}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {cardMeta.footerDetail}
                  </div>
                </div>
                {cardMeta.action}
              </CutoutCardFooter>
            </m.div>
          </m.div>
        </CutoutCardContent>
      </CutoutCard>
      <ConfirmDialog
        config={confirmConfig}
        onClose={() => setConfirmConfig(null)}
      />
    </>
  )
}
