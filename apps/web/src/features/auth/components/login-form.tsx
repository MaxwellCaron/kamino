import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { authSessionQueryOptions, login } from "../api/auth-api"

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
})

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
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <FieldGroup className="gap-5">
          <form.Field name="username">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <FieldContent>
                  <Input
                    id="username"
                    autoComplete="username"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="jdoe"
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field name="password">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <FieldContent>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="***********"
                  />
                </FieldContent>
              </Field>
            )}
          </form.Field>

          {mutation.error && (
            <FieldError className="text-center">
              {mutation.error.message}
            </FieldError>
          )}

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                size="lg"
                className="mt-1 w-full transition-transform active:scale-[0.96]"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
    </div>
  )
}
