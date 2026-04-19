import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { z } from "zod"
import { IconEdit } from "@tabler/icons-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { useRenameVM } from "@/hooks/use-vm-actions"
import { vmNameSchema } from "@/lib/vm-name"

const renameSchema = z.object({
  name: vmNameSchema,
})

export function RenameDialog({
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
  const rename = useRenameVM()

  const form = useForm({
    defaultValues: { name: currentName },
    onSubmit: async ({ value }) => {
      const parsed = renameSchema.parse(value)
      try {
        await rename.mutateAsync({ itemId, name: parsed.name })
        toast.success(
          currentVmid
            ? `VM ${currentVmid} renamed to "${parsed.name}"`
            : `VM renamed to "${parsed.name}"`
        )
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to rename VM"
        )
        return
      }

      onOpenChange(false)
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
          <DialogTitle>Rename</DialogTitle>
          <DialogDescription>
            Enter a new name for VM {currentVmid ?? "this VM"}.
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
              name="name"
              validators={{
                onBlur: ({ value }) => {
                  const result = renameSchema.shape.name.safeParse(value)
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
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input
                    id="name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
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
                  {isSubmitting ? "Renaming..." : "Rename"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
