import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { z } from "zod"
import { IconCopy } from "@tabler/icons-react"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  FieldGroup,
  FieldSeparator,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { useCloneVM } from "@/features/vms/hooks/use-vm-actions"
import {
  CloneDestinationFolderField,
  CloneFullCloneField,
  CloneNameField,
  CloneNodeField,
  CloneVmidField,
} from "@/features/vms/components/create/clone-form-fields"
import {
  optionalVmNameSchema,
  optionalVmidSchema,
} from "@/features/vms/components/create/create-vm-form"
import { getInventoryFolderOptions } from "@/features/inventory/utils/inventory-tree"
import { inventoryTreeQueryOptions } from "@/features/inventory/api/inventory-api"
import { nodesQueryOptions } from "@/features/vms/api/proxmox-options-api"
import { toastCloneVm } from "@/features/vms/utils/vm-toasts"
import { formatVmReference } from "@/features/shared/utils/format"

const cloneSchema = z.object({
  target_folder_id: z
    .string()
    .nullable()
    .refine((value) => !!value, "Destination folder is required"),
  node: z.string().default(""),
  newid: optionalVmidSchema,
  name: optionalVmNameSchema,
  full: z.boolean(),
})

export function CloneDialog({
  itemId,
  currentName,
  currentVmid,
  open,
  onOpenChange,
}: {
  itemId: string
  currentName: string
  currentVmid?: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const clone = useCloneVM()
  const { data: inventoryTree = [] } = useQuery({
    ...inventoryTreeQueryOptions,
    enabled: open,
  })
  const { data: nodes = [] } = useQuery({
    ...nodesQueryOptions,
    enabled: open,
  })
  const folderOptions = getInventoryFolderOptions(inventoryTree)

  const form = useForm({
    defaultValues: {
      target_folder_id: null as string | null,
      node: "",
      newid: 0,
      name: "",
      full: false,
    },
    onSubmit: ({ value }) => {
      const parsed = cloneSchema.parse(value)
      onOpenChange(false)

      toastCloneVm(
        clone.mutateAsync({
          itemId,
          newid: parsed.newid,
          name: parsed.name.trim() || currentName,
          full: parsed.full,
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
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => form.reset()}
      initialFocus={false}
      icon={IconCopy}
      title="Clone"
      description={`Clone ${formatVmReference(
        currentVmid,
        currentName
      )} into a new virtual machine.`}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
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
              <CloneVmidField
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

            <CloneFullCloneField
              FieldComponent={form.Field}
              fieldName="full"
              inputId="clone-full"
              dependencyLabel="source VM"
            />
          </FieldGroup>
        </FieldSet>

        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton disabled={isSubmitting}>
                {isSubmitting ? "Cloning..." : "Clone"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
