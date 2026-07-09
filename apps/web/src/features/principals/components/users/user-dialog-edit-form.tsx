import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import type { UserFormApi } from "@/features/principals/components/users/user-dialog-utils"
import {
  descriptionFieldSchema,
  fullNameSchema,
  optionalPasswordSchema,
  usernameSchema,
} from "@/features/principals/components/users/user-dialog-utils"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"

type UserDialogEditFormProps = {
  canRenameUsers: boolean
  canSetPasswords: boolean
  form: UserFormApi
}

export function UserDialogEditForm({
  canRenameUsers,
  canSetPasswords,
  form,
}: UserDialogEditFormProps) {
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
                  disabled={!canRenameUsers}
                />
              </FieldContent>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      </form.Field>

      <form.Field
        name="fullName"
        validators={{
          onSubmit: fullNameSchema,
        }}
      >
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="full-name">Full Name</FieldLabel>
              <FieldContent>
                <Input
                  id="full-name"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Maxwell Caron"
                  aria-invalid={isInvalid}
                />
              </FieldContent>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      </form.Field>

      {canSetPasswords ? (
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
      ) : null}

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
            <CountedTextareaField
              id="description"
              label="Description"
              placeholder="Optional description"
              isInvalid={isInvalid}
              value={field.state.value}
              onValueChange={field.handleChange}
              onBlur={field.handleBlur}
              maxLength={256}
              className="max-h-100"
              errors={isInvalid ? field.state.meta.errors : []}
            />
          )
        }}
      </form.Field>
    </FieldGroup>
  )
}
