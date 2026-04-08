import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
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
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Button } from "@workspace/ui/components/button"
import { IconPlus } from "@tabler/icons-react"
import { createGroup } from "@/lib/queries"

const groupSchema = z.object({
  sam_account_name: z
    .string()
    .min(1, "Name is required")
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, "Alphanumeric, dot, dash, underscore only"),
  display_name: z.string().min(1, "Display name is required").max(256),
  ou: z.string().min(1, "OU is required"),
})

export function CreateGroupDialog({
  defaultOU,
  open,
  onOpenChange,
}: {
  defaultOU: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof groupSchema>) => {
      await createGroup(values)
    },
    onSuccess: () => {
      toast.success("Group created")
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
      sam_account_name: "",
      display_name: "",
      ou: defaultOU,
    },
    onSubmit: async ({ value }) => {
      const parsed = groupSchema.parse(value)
      await mutation.mutateAsync(parsed)
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
          <DialogTitle>Create Group</DialogTitle>
          <DialogDescription>
            Create a new Active Directory security group.
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
              name="sam_account_name"
              validators={{
                onBlur: ({ value }) => {
                  const result =
                    groupSchema.shape.sam_account_name.safeParse(value)
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
                  <FieldLabel htmlFor="sam_account_name">
                    Account Name
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="sam_account_name"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="engineering-team"
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
              name="display_name"
              validators={{
                onBlur: ({ value }) => {
                  const result = groupSchema.shape.display_name.safeParse(value)
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
                  <FieldLabel htmlFor="display_name">Display Name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="display_name"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="Engineering Team"
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                  </FieldContent>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
            </form.Field>

            <form.Field name="ou">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="ou">Organizational Unit (DN)</FieldLabel>
                  <FieldContent>
                    <Input
                      id="ou"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="OU=Groups,DC=corp,DC=example,DC=com"
                    />
                  </FieldContent>
                </Field>
              )}
            </form.Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  <IconPlus data-icon="inline-start" />
                  {isSubmitting ? "Creating..." : "Create Group"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
