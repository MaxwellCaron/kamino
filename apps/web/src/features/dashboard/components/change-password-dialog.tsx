import { useState } from "react"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { IconSettings } from "@tabler/icons-react"
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
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import {
  authSessionQueryOptions,
  changeOwnPassword,
} from "@/features/auth/api/auth-api"

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [submitError, setSubmitError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: changeOwnPassword,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: authSessionQueryOptions.queryKey,
      })
      toast.success("Password updated")
      onOpenChange(false)
    },
  })

  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      const parsed = changePasswordSchema.safeParse(value)
      if (!parsed.success) {
        setSubmitError(parsed.error.issues[0]?.message ?? "Invalid password")
        return
      }

      setSubmitError(null)
      await mutation.mutateAsync({
        current_password: parsed.data.currentPassword,
        new_password: parsed.data.newPassword,
      })
    },
  })

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => {
        form.reset()
        setSubmitError(null)
        mutation.reset()
      }}
      initialFocus={false}
      icon={IconSettings}
      title="Settings"
      description="Change your password by confirming the current one first."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field
            name="currentPassword"
            validators={{
              onBlur: ({ value }) => {
                const result =
                  changePasswordSchema.shape.currentPassword.safeParse(value)
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
                <FieldLabel htmlFor="current-password">
                  Current Password
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    placeholder="************"
                  />
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field
            name="newPassword"
            validators={{
              onBlur: ({ value }) => {
                const result =
                  changePasswordSchema.shape.newPassword.safeParse(value)
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
                <FieldLabel htmlFor="new-password">New Password</FieldLabel>
                <FieldContent>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    placeholder="************"
                  />
                  <FieldDescription>
                    Use at least 8 characters.
                  </FieldDescription>
                  <FieldError>{field.state.meta.errors[0]}</FieldError>
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="confirmPassword">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="confirm-password">
                  Confirm New Password
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="************"
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <FieldError>{submitError ?? mutation.error?.message}</FieldError>
        </FieldGroup>

        <DialogFooter className="mt-6">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppDialogPrimaryButton disabled={isSubmitting}>
                {isSubmitting ? "Updating..." : "Update"}
              </AppDialogPrimaryButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
