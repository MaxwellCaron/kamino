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
import { createUser } from "@/lib/queries"

const userSchema = z.object({
  sam_account_name: z
    .string()
    .min(1, "Username is required")
    .max(20, "Max 20 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Alphanumeric, dot, dash, underscore only"),
  display_name: z.string().min(1, "Display name is required").max(256),
  ou: z.string().min(1, "OU is required"),
  password: z.string().min(8, "Minimum 8 characters"),
})

export function CreateUserDialog({
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
    mutationFn: async (values: z.infer<typeof userSchema>) => {
      await createUser(values)
    },
    onSuccess: () => {
      toast.success("User created")
      queryClient.invalidateQueries({ queryKey: ["principals", "users"] })
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
      password: "",
    },
    onSubmit: async ({ value }) => {
      const parsed = userSchema.parse(value)
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
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Create a new Active Directory user account.
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
                    userSchema.shape.sam_account_name.safeParse(value)
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
                  <FieldLabel htmlFor="sam_account_name">Username</FieldLabel>
                  <FieldContent>
                    <Input
                      id="sam_account_name"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="jdoe"
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
                  const result = userSchema.shape.display_name.safeParse(value)
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
                      placeholder="John Doe"
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
                      placeholder="OU=Users,DC=corp,DC=example,DC=com"
                    />
                  </FieldContent>
                </Field>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onBlur: ({ value }) => {
                  const result = userSchema.shape.password.safeParse(value)
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
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <FieldContent>
                    <Input
                      id="password"
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                    />
                  </FieldContent>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </Field>
              )}
            </form.Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  <IconPlus data-icon="inline-start" />
                  {isSubmitting ? "Creating..." : "Create User"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
