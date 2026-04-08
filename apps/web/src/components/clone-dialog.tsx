import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { z } from "zod"
import { IconCopy } from "@tabler/icons-react"
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
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { useCloneVM } from "@/hooks/use-vm-actions"

const cloneSchema = z.object({
  newid: z.number().int().min(100, "VM ID must be at least 100"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(63, "Name must be 63 characters or less"),
  full: z.boolean(),
})

export function CloneDialog({
  node,
  vmid,
  currentName,
  open,
  onOpenChange,
}: {
  node: string
  vmid: number
  currentName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const clone = useCloneVM()

  const form = useForm({
    defaultValues: {
      newid: 0,
      name: `${currentName}-clone`,
      full: true,
    },
    onSubmit: ({ value }) => {
      const parsed = cloneSchema.parse(value)
      toast.promise(clone.mutateAsync({ node, vmid, ...parsed }), {
        loading: `Cloning VM ${vmid} → ${parsed.newid}…`,
        success: `VM cloned to ${parsed.newid}`,
        error: (err: Error) => err.message,
      })
      onOpenChange(false)
      form.reset()
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clone VM</DialogTitle>
          <DialogDescription>
            Create a copy of this virtual machine.
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
              name="newid"
              validators={{
                onBlur: ({ value }) => {
                  const result = cloneSchema.shape.newid.safeParse(value)
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
                  <FieldLabel htmlFor="newid">New VM ID</FieldLabel>
                  <Input
                    id="newid"
                    type="number"
                    placeholder="e.g. 200"
                    value={field.state.value || ""}
                    onChange={(e) =>
                      field.handleChange(parseInt(e.target.value) || 0)
                    }
                    onBlur={field.handleBlur}
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  />
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
            </form.Field>
            <form.Field
              name="name"
              validators={{
                onBlur: ({ value }) => {
                  const result = cloneSchema.shape.name.safeParse(value)
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
                  <FieldLabel htmlFor="clone-name">Name</FieldLabel>
                  <Input
                    id="clone-name"
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
            <form.Field name="full">
              {(field) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="full-clone"
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(!!checked)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="full-clone">Full clone</FieldLabel>
                    <FieldDescription>
                      Create a full copy of the disk. Linked clones are faster
                      but depend on the source.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            </form.Field>
          </FieldGroup>
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
