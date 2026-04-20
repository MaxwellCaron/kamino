import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { IconCamera } from "@tabler/icons-react"
import { toast } from "sonner"
import { DialogFooter } from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { useCreateSnapshot } from "@/hooks/use-vm-actions"
import { formatVmReference } from "@/lib/utils"

const snapshotSchema = z.object({
  snapname: z
    .string()
    .min(1, "Snapshot name is required")
    .max(40, "Snapshot name must be 40 characters or less")
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      "Must start with a letter and contain only letters, numbers, hyphens, and underscores"
    ),
  description: z
    .string()
    .max(256, "Description must be 256 characters or less")
    .optional(),
  vmstate: z.boolean().optional(),
})

export function SnapshotDialog({
  itemId,
  vmid,
  vmName,
  open,
  onOpenChange,
}: {
  itemId: string
  vmid?: number
  vmName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateSnapshot(itemId)

  const form = useForm({
    defaultValues: {
      snapname: "",
      description: "",
      vmstate: false,
    },
    onSubmit: ({ value }) => {
      const parsed = snapshotSchema.parse(value)
      toast.promise(
        create.mutateAsync({
          itemId,
          snapname: parsed.snapname,
          description: parsed.description || undefined,
          vmstate: parsed.vmstate,
        }),
        {
          loading: `Creating snapshot "${parsed.snapname}"…`,
          success: `Snapshot "${parsed.snapname}" created`,
          error: (err: Error) => err.message,
        }
      )
      onOpenChange(false)
      form.reset()
    },
  })

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => form.reset()}
      initialFocus={false}
      icon={IconCamera}
      title="Snapshot"
      description={`Take a point-in-time snapshot for ${formatVmReference(
        vmid,
        vmName
      )}.`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field
            name="snapname"
            validators={{
              onBlur: ({ value }) => {
                const result = snapshotSchema.shape.snapname.safeParse(value)
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
                <FieldLabel htmlFor="snapname">Name</FieldLabel>
                <Input
                  id="snapname"
                  placeholder="my-snapshot"
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                <FieldError>{field.state.meta.errors[0]}</FieldError>
              </Field>
            )}
          </form.Field>
          <form.Field
            name="description"
            validators={{
              onBlur: ({ value }) => {
                const result = snapshotSchema.shape.description.safeParse(value)
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
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <span className="font-mono text-xs text-muted-foreground"></span>
                </div>
                <Textarea
                  id="description"
                  placeholder="Optional description..."
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  maxLength={255}
                />
                <FieldDescription className="text-right font-mono text-xs">
                  {field.state.value.length}/255
                </FieldDescription>
                <FieldError>{field.state.meta.errors[0]}</FieldError>
              </Field>
            )}
          </form.Field>
          <form.Field name="vmstate">
            {(field) => (
              <Field orientation="horizontal">
                <Checkbox
                  id="vmstate"
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(!!checked)}
                />
                <FieldContent>
                  <FieldLabel htmlFor="vmstate">Include VM state</FieldLabel>
                  <FieldDescription>
                    Save the RAM contents along with the snapshot. Uses more
                    storage.
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          </form.Field>
        </FieldGroup>
        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
