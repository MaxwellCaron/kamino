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
import { createUser, setUserPassword, updateUser } from "@/lib/queries"

const userSchema = z.object({
  username: z
    .string()
    .min(1, "Username is required")
    .max(20, "Max 20 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Alphanumeric, dot, dash, underscore only"),
  description: z.string().max(256).optional(),
  password: z.string().optional(),
})

export function UserDialog({
  user,
  open,
  onOpenChange,
}: {
  user?: ApiPrincipal
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const isEdit = !!user
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof userSchema>) => {
      if (isEdit) {
        await updateUser(user.id, {
          username: values.username,
          description: values.description,
        })
        if (values.password && values.password.length >= 8) {
          await setUserPassword(user.id, values.password)
        }
      } else {
        if (!values.password || values.password.length < 8) {
          throw new Error(
            "Minimum 8 characters password is required for new users"
          )
        }
        await createUser({
          username: values.username,
          description: values.description,
          password: values.password,
        })
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "User updated" : "User created")
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
      username: user?.name ?? "",
      description: user?.description ?? "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const parsed = userSchema.parse(value)
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
      title={isEdit ? "Edit User" : "Create User"}
      description={
        isEdit
          ? `Update the user account details for ${user.name ?? user.external_id}.`
          : "Create a new user account in Kamino."
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
            name="username"
            validators={{
              onBlur: ({ value }) => {
                const result = userSchema.shape.username.safeParse(value)
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
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <FieldContent>
                  <Input
                    id="username"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    maxLength={255}
                    placeholder="jdoe"
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
            name="password"
            validators={{
              onBlur: ({ value }) => {
                if (isEdit && !value) return undefined
                const result = z
                  .string()
                  .min(8, "Minimum 8 characters")
                  .safeParse(value)
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
                <FieldLabel htmlFor="password">
                  {isEdit ? "New Password" : "Password"}
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="password"
                    type="password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder={
                      isEdit ? "Leave blank to keep unchanged" : "Password123!"
                    }
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
                const result = userSchema.shape.description.safeParse(value)
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
