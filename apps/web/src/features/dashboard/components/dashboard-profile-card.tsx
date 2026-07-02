import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { HugeiconsIcon } from "@hugeicons/react"
import { PackageIcon, Settings01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { FacehashIcon } from "@workspace/ui/components/facehash"
import { cn } from "@workspace/ui/lib/utils"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { AuthUser } from "@/features/auth/types/auth-types"
import { GrainientBackground } from "@/components/grainient-background"
import { ConfirmDialog } from "@/components/dialogs/confirm-dialog"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { hasManagementPermission } from "@/features/auth/utils/management-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import {
  createPersonalPod,
  personalPodQueryOptions,
  requestPersonalPod,
} from "@/features/pods/api/personal-pod-api"
import { requesterRequestSummariesQueryOptions } from "@/features/requests/api/requests-api"

export function DashboardProfileCard({
  className,
  onSettingsClick,
  roleLabel,
  user,
}: {
  className?: string
  onSettingsClick: () => void
  roleLabel: string
  user: AuthUser
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null)
  const { data: personalPodStatus } = useQuery(personalPodQueryOptions)
  const isManager = hasManagementPermission(
    user.management_permissions,
    "manager"
  )
  const existingPersonalPod = personalPodStatus?.personal_pod

  const personalPodAction = existingPersonalPod
    ? {
        label: "Personal Pod",
        onClick: () =>
          navigate({
            to: "/inventory/items/$itemId",
            params: { itemId: existingPersonalPod.folder_id },
          }),
      }
    : isManager
      ? {
          label: "Create Personal Pod",
          onClick: () =>
            setConfirmConfig({
              title: "Create Personal Pod",
              description:
                "Provision a personal folder with a router and a reserved network.",
              actionLabel: "Create",
              onConfirm: () => {
                showSingleMutationToast({
                  title: "Creating Personal Pod",
                  name: user.username,
                  promise: async () => {
                    const result = await createPersonalPod()
                    await queryClient.invalidateQueries({
                      queryKey: personalPodQueryOptions.queryKey,
                    })
                    await queryClient.invalidateQueries({
                      queryKey: inventoryTreeQueryOptions.queryKey,
                    })
                    navigate({
                      to: "/inventory/items/$itemId",
                      params: { itemId: result.folder_id },
                    })
                    return result
                  },
                  successDescription: "Created",
                })
              },
            }),
        }
      : {
          label: "Request Personal Pod",
          onClick: () =>
            setConfirmConfig({
              title: "Request Personal Pod",
              description:
                "Submit a request for a personal folder with a router and a reserved network.",
              actionLabel: "Request",
              onConfirm: () => {
                showSingleMutationToast({
                  title: "Requesting Personal Pod",
                  name: user.username,
                  promise: async () => {
                    const result = await requestPersonalPod()
                    await queryClient.invalidateQueries({
                      queryKey: personalPodQueryOptions.queryKey,
                    })
                    await queryClient.invalidateQueries({
                      queryKey:
                        requesterRequestSummariesQueryOptions("pending")
                          .queryKey,
                    })
                    return result
                  },
                  successDescription: "Requested",
                })
              },
            }),
        }

  return (
    <>
      <Card
        className={cn("h-full overflow-hidden rounded-4xl pt-0", className)}
      >
        <div className="relative h-28 w-full overflow-hidden">
          <GrainientBackground />
        </div>

        <CardHeader className="relative mx-auto -mt-18.5 flex w-full justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-end gap-4">
            <FacehashIcon name={user.username} size={80} />
            <div className="min-w-0 pb-2">
              <CardTitle className="truncate text-2xl tracking-tight">
                {user.username}
              </CardTitle>
              <CardDescription>{roleLabel}</CardDescription>
            </div>
          </div>
          <CardAction className="flex shrink-0 flex-wrap justify-end gap-2 self-end pb-2">
            <Button
              type="button"
              variant="secondary"
              onClick={personalPodAction.onClick}
            >
              <HugeiconsIcon icon={PackageIcon} data-icon="inline-start" />
              {personalPodAction.label}
            </Button>
            <Button type="button" onClick={onSettingsClick}>
              <HugeiconsIcon icon={Settings01Icon} data-icon="inline-start" />
              Settings
            </Button>
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
