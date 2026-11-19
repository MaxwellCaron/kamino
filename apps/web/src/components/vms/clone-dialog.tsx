import {
  AppDialog,
  AppDialogPrimaryButton,
  AppDialogScrollBody,
} from "@/components/dialogs/app-dialog"
import {
  CloneDestinationFolderField,
  CloneFullCloneField,
  CloneNameField,
  CloneNodeField,
} from "@/components/vms/create/clone-form-fields"
import {
  FieldError,
  FieldGroup,
  FieldSeparator,
  FieldSet,
} from "@workspace/ui/components/field"
import { CopyIcon } from "@hugeicons/core-free-icons"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { InventoryPermissionKeys } from "@/lib/inventory/inventory-permissions"
import { PreloadOverlay } from "@/components/feedback/loading-overlay"
import { VMIDField } from "@/components/vms/vmid-field"
import { cloneSchema } from "@/lib/vms/clone-form"
import { formatVmReference } from "@/lib/vms/vm-reference"
import { getCloneVmToastOptions } from "@/lib/vms/vm-toasts"
import { getInventoryFolderOptions } from "@/lib/inventory/inventory-tree"
import { inventoryTreeQueryOptions } from "@/lib/inventory/inventory-api"
import { nodesQueryOptions } from "@/lib/vms/proxmox-options-api"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { useCloneVM } from "@/hooks/vms/use-vm-actions"
import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"

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

      showSingleMutationToast(
        getCloneVmToastOptions(
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
      )
    },
  })

  return (
    <AppDialog
      className="sm:max-w-xl"
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => form.reset()}
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

            <form.Subscribe selector={(state) => state.canSubmit}>
              {(canSubmit) =>
                canSubmit ? null : (
                  <FieldError>
                    Correct the highlighted fields before cloning.
                  </FieldError>
                )
              }
            </form.Subscribe>

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
