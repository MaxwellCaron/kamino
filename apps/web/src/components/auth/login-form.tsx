import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AppActionButton } from "@/components/app-action-button"
import { Input } from "@workspace/ui/components/input"
import { authSessionQueryOptions } from "@/lib/auth/auth-queries"
import { cn } from "@workspace/ui/lib/utils"
import { isTouchedInvalid } from "@/lib/forms/form-errors"
import { login } from "@/lib/auth/auth-session"
import { loginSchema } from "@/lib/auth/login-form"
import { useForm } from "@tanstack/react-form"

export function LoginForm({
  className,
  onSuccess,
  ...props
}: React.ComponentProps<"div"> & {
  onSuccess?: () => void
}) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      queryClient.setQueryData(authSessionQueryOptions.queryKey, data)
      onSuccess?.()
    },
  })

  const form = useForm({
    defaultValues: { username: "", password: "" },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(loginSchema.parse(value))
    },
  })

  return (
    <div className={cn("flex flex-col", className)} {...props}>
      <div className="mb-8">
        <h1 className="mt-3 font-heading text-3xl leading-tight font-medium">
          Sign in to Kamino
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your credentials to continue.
        </p>
      </div>

      <form
        action={() => {
          void form.handleSubmit()
        }}
      >
        <FieldGroup className="gap-5">
          <form.Field name="username">
            {(field) => {
              const isInvalid = isTouchedInvalid(field.state.meta)

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Username</FieldLabel>
                  <FieldContent>
                    <Input
                      id={field.name}
                      name={field.name}
                      required
                      autoComplete="username"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="jdoe"
                      aria-invalid={isInvalid}
                      aria-errormessage={
                        isInvalid ? "login-username-error" : undefined
                      }
                    />
                  </FieldContent>
                  {isInvalid && (
                    <FieldError
                      id="login-username-error"
                      errors={field.state.meta.errors}
                    />
                  )}
                </Field>
              )
            }}
          </form.Field>

          <form.Field name="password">
            {(field) => {
              const isInvalid = isTouchedInvalid(field.state.meta)

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                  <FieldContent>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      required
                      autoComplete="current-password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      placeholder="***********"
                      aria-invalid={isInvalid}
                      aria-errormessage={
                        isInvalid ? "login-password-error" : undefined
                      }
                    />
                  </FieldContent>
                  {isInvalid && (
                    <FieldError
                      id="login-password-error"
                      errors={field.state.meta.errors}
                    />
                  )}
                </Field>
              )
            }}
          </form.Field>

          {mutation.error && (
            <FieldError className="text-center">
              {mutation.error.message}
            </FieldError>
          )}

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AppActionButton
                type="submit"
                size="lg"
                className="mt-1 w-full transition-transform active:scale-[0.96]"
                pending={isSubmitting}
                pendingLabel="Signing in..."
              >
                Sign in
              </AppActionButton>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
    </div>
  )
}
