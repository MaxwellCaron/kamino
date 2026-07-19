import { useForm } from "@tanstack/react-form"
import { PencilEdit01Icon } from "@hugeicons/core-free-icons"
import { z } from "zod"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { FieldGroup } from "@workspace/ui/components/field"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { isTouchedInvalid } from "@/components/forms/form-errors"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"
import { useUpdateVMNotes } from "@/features/vms/hooks/use-vm-actions"
import { toastUpdateNotes } from "@/features/vms/utils/vm-toasts"
import { formatVmReference } from "@/features/shared/utils/format"

const vmNotesSchema = z.object({
  notes: z.string().trim().max(256, "Notes must be 256 characters or less"),
})

export function VmNotesDialog({
  itemId,
  vmName,
  vmid,
  initialNotes,
  open,
  onOpenChange,
}: {
  itemId: string
  vmName: string
  vmid: number
  initialNotes?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const updateNotes = useUpdateVMNotes()

  const form = useForm({
    defaultValues: {
      notes: initialNotes ?? "",
    },
    validators: {
      onSubmit: vmNotesSchema,
    },
    onSubmit: ({ value }) => {
      const parsed = vmNotesSchema.parse(value)
      onOpenChange(false)

      toastUpdateNotes(
        updateNotes.mutateAsync({
          itemId,
          notes: parsed.notes,
        })
      )
    },
  })

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() =>
        form.reset({
          notes: initialNotes ?? "",
        })
      }
      icon={PencilEdit01Icon}
      title="Notes"
      description={`Update notes for ${formatVmReference(vmid, vmName)}.`}
    >
      <form
        action={() => {
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="notes">
            {(field) => {
              const isInvalid = isTouchedInvalid(field.state.meta)

              return (
                <CountedTextareaField
                  id="notes"
                  label="Notes"
                  placeholder={`Add notes for ${vmName}...`}
                  isInvalid={isInvalid}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  onBlur={field.handleBlur}
                  maxLength={256}
                  className="max-h-100"
                  errors={isInvalid ? field.state.meta.errors : []}
                />
              )
            }}
          </form.Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton pending={isSubmitting}>
                Save
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
