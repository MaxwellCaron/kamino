import { useMemo } from "react"
import { useForm } from "@tanstack/react-form"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { RouterIcon } from "@hugeicons/core-free-icons"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { ManualRouterCloneFormFields } from "./manual-router-clone-form-fields"
import type { PodNetworkProfile } from "@/features/pods/api/create-pod-api"
import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { DialogBodySkeleton } from "@/components/loading-skeletons"
import {
  cloneRouter,
  routerCloneOptionsQueryOptions,
} from "@/features/pods/api/router-clone-api"
import {
  inventoryTreeQueryOptions,
  seedInventoryItemCache,
} from "@/features/inventory/api/inventory-api"
import { getInventoryFolderOptions } from "@/features/inventory/utils/inventory-tree"
import { InventoryPermissionKeys } from "@/features/inventory/utils/inventory-permissions"

export type RouterCloneFormValues = {
  target_folder_id: string | null
  network_number: string
  network_profile_key: PodNetworkProfile["key"]
}

const routerCloneFormSchema = z.object({
  target_folder_id: z
    .string()
    .nullable()
    .refine(
      (value): value is string => !!value,
      "Destination folder is required"
    ),
  network_number: z
    .string()
    .trim()
    .min(1, "Pod VNet number is required")
    .refine(
      (value) => /^\d+$/.test(value),
      "Pod VNet number must be a whole number"
    )
    .transform((value) => Number.parseInt(value, 10))
    .refine(
      (value) => value >= 1 && value <= 254,
      "Pod VNet number must be between 1 and 254"
    ),
  network_profile_key: z.enum(["lan-router-v1", "lan-dmz-router-v1"]),
})

function getRouterCloneToastName(
  folderOptions: ReturnType<typeof getInventoryFolderOptions>,
  folderId: string,
  networkNumber: number
) {
  const folder = folderOptions.find((option) => option.id === folderId)
  return folder
    ? `${folder.label} · pod ${networkNumber}`
    : `pod ${networkNumber}`
}

export function ManualRouterCloneDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const {
    data: routerOptions,
    error: routerOptionsError,
    isLoading: isRouterOptionsLoading,
  } = useQuery({
    ...routerCloneOptionsQueryOptions,
    enabled: open,
  })

  const {
    data: inventoryTreeData,
    error: inventoryTreeError,
    isLoading: isInventoryTreeLoading,
  } = useQuery({
    ...inventoryTreeQueryOptions,
    enabled: open,
  })

  const folderOptions = useMemo(
    () =>
      getInventoryFolderOptions(
        inventoryTreeData,
        InventoryPermissionKeys.createVm
      ),
    [inventoryTreeData]
  )

  const form = useForm({
    defaultValues: {
      target_folder_id: null as string | null,
      network_number: "",
      network_profile_key: "lan-router-v1" as PodNetworkProfile["key"],
    },
    onSubmit: ({ value }) => {
      const parsed = routerCloneFormSchema.parse(value)
      onOpenChange(false)

      showSingleMutationToast({
        title: "Cloning router",
        name: getRouterCloneToastName(
          folderOptions,
          parsed.target_folder_id,
          parsed.network_number
        ),
        promise: async () => {
          const result = await cloneRouter({
            target_folder_id: parsed.target_folder_id,
            network_number: parsed.network_number,
            network_profile_key: parsed.network_profile_key,
          })
          seedInventoryItemCache(queryClient, result.item_id, result.item)
          await queryClient.invalidateQueries({
            queryKey: inventoryTreeQueryOptions.queryKey,
          })
        },
        successDescription: "Cloned",
      })
    },
  })

  const isLoadingOptions = isRouterOptionsLoading || isInventoryTreeLoading
  const optionsError = routerOptionsError ?? inventoryTreeError
  const routerTemplateConfigured =
    routerOptions?.router_template_configured ?? false
  const networkProfiles = routerOptions?.network_profiles ?? []
  const hasDestinationFolders = folderOptions.length > 0
  const submitUnavailable =
    !routerTemplateConfigured || !hasDestinationFolders || isLoadingOptions

  function resetDialog() {
    form.reset()
  }

  return (
    <AppDialog
      className="sm:max-w-xl"
      open={open}
      onOpenChange={onOpenChange}
      onClosed={resetDialog}
      initialFocus={false}
      icon={RouterIcon}
      title="Clone router"
      description="Clone, configure, and start the pod router in a selected folder."
    >
      {optionsError ? (
        <InlineErrorAlert
          error={optionsError}
          fallback="Failed to load router clone options."
        />
      ) : isLoadingOptions ? (
        <DialogBodySkeleton rows={4} />
      ) : (
        <form
          action={() => {
            void form.handleSubmit()
          }}
        >
          <AppDialogScrollBody>
            <ManualRouterCloneFormFields
              form={form}
              routerTemplateConfigured={routerTemplateConfigured}
              hasDestinationFolders={hasDestinationFolders}
              networkProfiles={networkProfiles}
              networkOptions={routerOptions?.network_options}
              folderOptions={folderOptions}
            />
          </AppDialogScrollBody>

          <DialogFooter>
            <form.Subscribe selector={(state) => state.canSubmit}>
              {(canSubmit) => (
                <AppDialogPrimaryButton
                  disabled={submitUnavailable || !canSubmit}
                >
                  Clone router
                </AppDialogPrimaryButton>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      )}
    </AppDialog>
  )
}
