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
import type { UserFormApi } from "@/features/principals/components/users/user-dialog-utils"
import {
  usernameSchema,
  validateDescription,
  validateOptionalPassword,
} from "@/features/principals/components/users/user-dialog-utils"

type UserDialogEditFormProps = {
  form: UserFormApi
}

export function UserDialogEditForm({ form }: UserDialogEditFormProps) {
  return (
    <FieldGroup>
      <form.Field
        name="username"
        validators={{
          onBlur: ({ value }) => {
            const result = usernameSchema.safeParse(value)
            return result.success ? undefined : result.error.issues[0].message
          },
        }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <FieldContent>
              <Input
                id="username"
                maxLength={20}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="jdoe"
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
              />
            </FieldContent>
            <FieldError>{field.state.meta.errors[0]}</FieldError>
          </Field>
        )}
      </form.Field>

      <form.Field
        name="password"
        validators={{
          onBlur: ({ value }) => validateOptionalPassword(value),
        }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <FieldLabel htmlFor="password">New Password</FieldLabel>
            <FieldContent>
              <Input
                id="password"
                type="password"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="Leave blank to keep unchanged"
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
              />
            </FieldContent>
            <FieldError>{field.state.meta.errors[0]}</FieldError>
          </Field>
        )}
      </form.Field>

      <form.Field
        name="description"
        validators={{
          onBlur: ({ value }) => validateDescription(value),
        }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <FieldLabel htmlFor="description">Description</FieldLabel>
            <FieldContent>
              <Textarea
                id="description"
                maxLength={256}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="Optional description"
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
              />
            </FieldContent>
            <FieldDescription className="text-right font-mono text-xs">
              {field.state.value.length}/256
            </FieldDescription>
            <FieldError>{field.state.meta.errors[0]}</FieldError>
          </Field>
        )}
      </form.Field>
    </FieldGroup>
  )
}
