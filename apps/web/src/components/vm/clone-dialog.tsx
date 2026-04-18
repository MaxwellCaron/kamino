import { useForm } from "@tanstack/react-form"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { z } from "zod"
import { IconCopy } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  FieldGroup,
  FieldSeparator,
  FieldSet,
} from "@workspace/ui/components/field"
import { useCloneVM } from "@/hooks/use-vm-actions"
import {
  CloneDestinationFolderField,
  CloneFullCloneField,
  CloneNameField,
  CloneNodeField,
  CloneVmidField,
} from "@/components/vm/create/clone-form-fields"
import {
  optionalVmNameSchema,
  optionalVmidSchema,
} from "@/components/vm/create/create-vm-form"
import { getInventoryFolderOptions } from "@/lib/inventory-tree"
import { inventoryTreeQueryOptions, nodesQueryOptions } from "@/lib/queries"

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
  node,
  vmid,
  currentName,
  sourceItemId: _sourceItemId,
  open,
  onOpenChange,
}: {
  node: string
  vmid: number
  currentName: string
  sourceItemId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
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
    onSubmit: async ({ value }) => {
      const parsed = cloneSchema.parse(value)
      const promise = clone.mutateAsync({
        node,
        vmid,
        newid: parsed.newid,
        name: parsed.name.trim() || currentName,
        full: parsed.full,
        target: parsed.node || undefined,
        target_folder_id: parsed.target_folder_id ?? "",
      })

      toast.promise(promise, {
        loading: `Cloning VM ${vmid}…`,
        success: (result) => `VM cloned to ${result.vmid}`,
        error: (error: Error) => error.message,
      })

      const result = await promise
      onOpenChange(false)
      form.reset()
      navigate({ to: "/vm/$itemId", params: { itemId: result.item_id } })
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen)
        if (!isOpen) form.reset()
      }}
    >
      <DialogContent initialFocus={false}>
        <DialogHeader>
          <DialogTitle>Clone VM</DialogTitle>
          <DialogDescription>
            Clone {currentName} into a new virtual machine.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
        >
          <div className="flex flex-col gap-6">
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
          </div>

          <DialogFooter className="mt-6">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  <IconCopy data-icon="inline-start" />
                  {isSubmitting ? "Cloning..." : "Clone"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
