import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Settings01Icon } from "@hugeicons/core-free-icons"
import { z } from "zod"
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
import { isTouchedInvalid } from "@/components/forms/form-errors"
import {
  authSessionQueryOptions,
  changeOwnPassword,
} from "@/features/auth/api/auth-api"
import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"

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
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: changeOwnPassword,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: authSessionQueryOptions.queryKey,
      }),
  })

  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: changePasswordSchema,
    },
    onSubmit: ({ value }) => {
      const parsed = changePasswordSchema.parse(value)
      const promise = mutation.mutateAsync({
        current_password: parsed.currentPassword,
        new_password: parsed.newPassword,
      })
      onOpenChange(false)
      showSingleMutationToast({
        title: "Updating password",
        name: "Account",
        promise,
        successDescription: "Password updated",
      })
    },
  })

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => {
        form.reset()
      }}
      initialFocus={false}
      icon={Settings01Icon}
      title="Settings"
      description="Change your password by confirming the current one first."
    >
      <form
        action={() => {
          void form.handleSubmit()
        }}
      >
        <FieldGroup>
          <form.Field name="currentPassword">
            {(field) => {
              const isInvalid = isTouchedInvalid(field.state.meta)

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="current-password">
                    Current Password
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      aria-invalid={isInvalid}
                      placeholder="************"
                    />
                  </FieldContent>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="newPassword">
            {(field) => {
              const isInvalid = isTouchedInvalid(field.state.meta)

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="new-password">New Password</FieldLabel>
                  <FieldContent>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      aria-invalid={isInvalid}
                      placeholder="************"
                    />
                    <FieldDescription>
                      Use at least 8 characters.
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </FieldContent>
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="confirmPassword">
            {(field) => {
              const isInvalid = isTouchedInvalid(field.state.meta)

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor="confirm-password">
                    Confirm New Password
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      placeholder="************"
                      aria-invalid={isInvalid}
                    />
                  </FieldContent>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>
        </FieldGroup>

        <DialogFooter className="mt-6">
          <AppDialogPrimaryButton pending={mutation.isPending}>
            Update
          </AppDialogPrimaryButton>
        </DialogFooter>
      </form>
    </AppDialog>
  )
}
