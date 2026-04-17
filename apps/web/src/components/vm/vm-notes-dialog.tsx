import { useEffect } from "react"
import { useForm } from "@tanstack/react-form"
import { IconEdit } from "@tabler/icons-react"
import { toast } from "sonner"
import { z } from "zod"
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Textarea } from "@workspace/ui/components/textarea"
import { useUpdateVMNotes } from "@/hooks/use-vm-actions"

const vmNotesSchema = z.object({
  notes: z.string().max(255, "Notes must be 255 characters or less"),
})

export function VmNotesDialog({
  node,
  vmid,
  initialNotes,
  open,
  onOpenChange,
}: {
  node: string
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
    onSubmit: async ({ value }) => {
      const parsed = vmNotesSchema.parse(value)

      try {
        const result = await updateNotes.mutateAsync({
          node,
          vmid,
          notes: parsed.notes,
        })
        toast.success(
          result.synced
            ? "VM notes updated"
            : "VM notes saved. Proxmox sync is pending."
        )
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update VM notes"
        )
        return
      }

      onOpenChange(false)
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={false}>
        <DialogHeader>
          <DialogTitle>Edit Notes</DialogTitle>
          <DialogDescription>
            Update the notes stored in Kamino and replicated to Proxmox for VM{" "}
            {vmid}.
          </DialogDescription>
        </DialogHeader>
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
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel htmlFor="notes">Notes</FieldLabel>
                    <span className="font-mono text-xs text-muted-foreground">
                      {field.state.value.length}/255
                    </span>
                  </div>
                  <Textarea
                    id="notes"
                    placeholder="Add notes for this VM..."
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    maxLength={255}
                  />
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
            </form.Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  <IconEdit data-icon="inline-start" />
                  {isSubmitting ? "Saving..." : "Save"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
