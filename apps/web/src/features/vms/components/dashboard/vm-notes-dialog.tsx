import { useEffect } from "react"
import { useForm } from "@tanstack/react-form"
import { IconEdit } from "@tabler/icons-react"
import { z } from "zod"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
} from "@workspace/ui/components/field"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { useUpdateVMNotes } from "@/features/vms/hooks/use-vm-actions"
import { toastUpdateNotes } from "@/features/vms/utils/vm-toasts"
import { formatVmReference } from "@/features/shared/utils/utils"

const vmNotesSchema = z.object({
  notes: z.string().max(255, "Notes must be 255 characters or less"),
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

  useEffect(() => {
    if (!open) {
      form.reset({
        notes: initialNotes ?? "",
      })
    }
  }, [form, initialNotes, open])

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={IconEdit}
      title="Notes"
      description={`Update notes for ${formatVmReference(vmid, vmName)}.`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field
            name="notes"
            validators={{
              onBlur: ({ value }) => {
                const result = vmNotesSchema.shape.notes.safeParse(value)
                return result.success
                  ? undefined
                  : result.error.issues[0].message
              },
            }}
          >
            {(field) => (
              <Field
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <Textarea
                  id="notes"
                  placeholder={`Add notes for ${vmName}...`}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  maxLength={255}
                />
                <FieldDescription className="text-right font-mono text-xs">
                  {field.state.value.length}/255
                </FieldDescription>
                <FieldError>{field.state.meta.errors[0]}</FieldError>
              </Field>
            )}
          </form.Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
