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
  descriptionFieldSchema,
  optionalPasswordSchema,
  usernameSchema,
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
          onSubmit: usernameSchema,
        }}
      >
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <FieldContent>
                <Input
                  id="username"
                  maxLength={20}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="jdoe"
                  aria-invalid={isInvalid}
                />
              </FieldContent>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      </form.Field>

      <form.Field
        name="password"
        validators={{
          onSubmit: optionalPasswordSchema,
        }}
      >
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="password">New Password</FieldLabel>
              <FieldContent>
                <Input
                  id="password"
                  type="password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Leave blank to keep unchanged"
                  aria-invalid={isInvalid}
                />
              </FieldContent>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      </form.Field>

      <form.Field
        name="description"
        validators={{
          onSubmit: descriptionFieldSchema,
        }}
      >
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <FieldContent>
                <Textarea
                  id="description"
                  maxLength={256}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Optional description"
                  aria-invalid={isInvalid}
                />
              </FieldContent>
              <FieldDescription className="text-right font-mono text-xs">
                {field.state.value.length}/256
              </FieldDescription>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      </form.Field>
    </FieldGroup>
  )
}
