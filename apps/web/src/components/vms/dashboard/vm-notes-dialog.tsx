import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { FieldError, FieldGroup } from "@workspace/ui/components/field"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { PencilEdit01Icon } from "@hugeicons/core-free-icons"
import { formatVmReference } from "@/lib/vms/vm-reference"
import { getUpdateNotesToastOptions } from "@/lib/vms/vm-toasts"
import { isTouchedInvalid } from "@/lib/forms/form-errors"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { useForm } from "@tanstack/react-form"
import { useUpdateVMNotes } from "@/hooks/vms/use-vm-actions"
import { vmNotesSchema } from "@/lib/vms/vm-notes-form"

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

      showSingleMutationToast(
        getUpdateNotesToastOptions(
          updateNotes.mutateAsync({
            itemId,
            notes: parsed.notes,
          })
        )
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
        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) =>
            canSubmit ? null : (
              <FieldError>Correct the notes field to continue.</FieldError>
            )
          }
        </form.Subscribe>
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
