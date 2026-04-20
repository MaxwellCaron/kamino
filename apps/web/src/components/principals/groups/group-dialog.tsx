import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { IconEdit, IconPlus } from "@tabler/icons-react"
import { z } from "zod"
import { toast } from "sonner"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import type { ApiPrincipal } from "@/lib/queries"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { createGroup, updateGroup } from "@/lib/queries"

const groupSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, "Alphanumeric, dot, dash, underscore only"),
  description: z.string().max(256).optional(),
})

export function GroupDialog({
  group,
  open,
  onOpenChange,
}: {
  group?: ApiPrincipal
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!group
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof groupSchema>) => {
      if (isEdit) {
        await updateGroup(group.id, {
          name: values.name,
          description: values.description,
        })
      } else {
        await createGroup({
          name: values.name,
          description: values.description,
        })
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Group updated" : "Group created")
      queryClient.invalidateQueries({ queryKey: ["principals", "groups"] })
      onOpenChange(false)
      form.reset()
    },
    onError: (err) => {
      toast.error(err.message)
    },
  })

  const form = useForm({
    defaultValues: {
      name: group?.name ?? "",
      description: group?.description ?? "",
    },
    onSubmit: async ({ value }) => {
      const parsed = groupSchema.parse(value)
      await mutation.mutateAsync(parsed)
    },
  })

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => form.reset()}
      initialFocus={false}
      icon={isEdit ? IconEdit : IconPlus}
      title={isEdit ? "Edit Group" : "Create Group"}
      description={
        isEdit
          ? `Update the group account details for ${group.name ?? group.external_id}.`
          : "Create a new group in Kamino."
      }
    >
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
                const result = groupSchema.shape.name.safeParse(value)
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
                <FieldContent>
                  <Input
                    id="name"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Admins"
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  />
                </FieldContent>
                <FieldError>{field.state.meta.errors[0]}</FieldError>
              </Field>
            )}
          </form.Field>

          <form.Field
            name="description"
            validators={{
              onBlur: ({ value }) => {
                const result = groupSchema.shape.description.safeParse(value)
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
                <FieldLabel htmlFor="description">Description</FieldLabel>
                <FieldContent>
                  <Textarea
                    id="description"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    maxLength={255}
                    placeholder="Optional description"
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  />
                </FieldContent>
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
              <AppDialogPrimaryButton type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? isEdit
                    ? "Saving..."
                    : "Creating..."
                  : isEdit
                    ? "Save"
                    : "Create"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
