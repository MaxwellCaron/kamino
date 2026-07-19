import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { CopyIcon } from "@hugeicons/core-free-icons"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  FieldGroup,
  FieldSeparator,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { PreloadOverlay } from "@/components/loading-overlay"
import { useCloneVM } from "@/features/vms/hooks/use-vm-actions"
import {
  CloneDestinationFolderField,
  CloneFullCloneField,
  CloneNameField,
  CloneNodeField,
} from "@/features/vms/components/create/clone-form-fields"
import { optionalVmNameSchema } from "@/features/vms/components/create/create-vm-form"
import { VMIDField } from "@/components/vms/vmid-field"
import { optionalVmidSchema } from "@/components/vms/vmid-schema"
import { getInventoryFolderOptions } from "@/features/inventory/utils/inventory-tree"
import { InventoryPermissionKeys } from "@/features/inventory/utils/inventory-permissions"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { nodesQueryOptions } from "@/features/vms/api/proxmox-options-api"
import { toastCloneVm } from "@/features/vms/utils/vm-toasts"
import { formatVmReference } from "@/features/shared/utils/format"

const cloneSchema = z.object({
  target_folder_id: z
    .string()
    .nullable()
    .refine((value) => !!value, "Destination folder is required"),
  node: z.string().trim().default(""),
  newid: optionalVmidSchema,
  name: optionalVmNameSchema,
  full: z.boolean(),
})

export function CloneDialog({
  itemId,
  currentName,
  currentVmid,
  isTemplate,
  open,
  onOpenChange,
}: {
  itemId: string
  currentName: string
  currentVmid?: number
  isTemplate?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const clone = useCloneVM()
  const {
    data: inventoryTreeData,
    error: inventoryTreeError,
    isLoading: isInventoryTreeLoading,
  } = useQuery({
    ...inventoryTreeQueryOptions,
    enabled: open,
  })
  const inventoryTree = inventoryTreeData ?? []
  const {
    data: nodesData,
    error: nodesError,
    isLoading: isNodesLoading,
  } = useQuery({
    ...nodesQueryOptions,
    enabled: open,
  })
  const nodes = nodesData ?? []
  const folderOptions = getInventoryFolderOptions(
    inventoryTree,
    InventoryPermissionKeys.createVm
  )
  const isLoadingOptions = isInventoryTreeLoading || isNodesLoading
  const optionsError = inventoryTreeError ?? nodesError

  const form = useForm({
    defaultValues: {
      target_folder_id: null as string | null,
      node: "",
      newid: 0,
      name: "",
      full: !isTemplate,
    },
    onSubmit: ({ value }) => {
      const parsed = cloneSchema.parse(value)
      onOpenChange(false)

      toastCloneVm(
        clone.mutateAsync({
          itemId,
          newid: parsed.newid,
          name: parsed.name || currentName,
          full: isTemplate ? parsed.full : true,
          target: parsed.node || undefined,
          target_folder_id: parsed.target_folder_id ?? "",
        }),
        currentVmid,
        currentName
      )
    },
  })

  return (
    <AppDialog
      className="sm:max-w-xl"
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => form.reset()}
      initialFocus={false}
      icon={CopyIcon}
      title="Clone"
      description={`Clone ${formatVmReference(
        currentVmid,
        currentName
      )} into a new virtual machine.`}
    >
      <div className="relative min-h-88">
        <PreloadOverlay
          active={isLoadingOptions}
          label="Loading VM clone options"
        />
        {optionsError ? (
          <InlineErrorAlert
            error={optionsError}
            fallback="Failed to load clone options."
          />
        ) : !isLoadingOptions ? (
          <form
            action={() => {
              void form.handleSubmit()
            }}
          >
            <AppDialogScrollBody>
              <FieldSet>
                <FieldGroup>
                  <CloneNameField
                    FieldComponent={form.Field}
                    fieldName="name"
                    inputId="clone-name"
                    placeholder={`${currentName} (Default)`}
                  />

                  <div className="grid grid-cols-2 gap-6">
                    <CloneNodeField
                      FieldComponent={form.Field}
                      fieldName="node"
                      inputId="clone-node"
                      nodes={nodes}
                    />
                    <VMIDField
                      FieldComponent={form.Field}
                      fieldName="newid"
                      inputId="clone-vmid"
                    />
                  </div>

                  <FieldSeparator />

                  <CloneDestinationFolderField
                    FieldComponent={form.Field}
                    fieldName="target_folder_id"
                    folderOptions={folderOptions}
                  />

                  {isTemplate && (
                    <CloneFullCloneField
                      FieldComponent={form.Field}
                      fieldName="full"
                      inputId="clone-full"
                      dependencyLabel="source VM"
                    />
                  )}
                </FieldGroup>
              </FieldSet>
            </AppDialogScrollBody>

            <DialogFooter>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <AppDialogPrimaryButton pending={isSubmitting}>
                    Clone
                  </AppDialogPrimaryButton>
                )}
              </form.Subscribe>
            </DialogFooter>
          </form>
        ) : null}
      </div>
    </AppDialog>
  )
}
