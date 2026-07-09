import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import type React from "react"
import type { UserFormApi } from "@/features/principals/components/users/user-dialog-utils"
import {
  descriptionFieldSchema,
  requiredPasswordSchema,
  usernameSchema,
} from "@/features/principals/components/users/user-dialog-utils"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"
import { UserDialogGroupAssignmentsField } from "@/features/principals/components/users/user-dialog-group-assignments-field"

export function UserDialogCreateSingleTab({
  form,
  groupItems,
  groupOptionMap,
  requirePassword,
  selectedGroupIds,
  setSelectedGroupIds,
}: {
  form: UserFormApi
  groupItems: Array<string>
  groupOptionMap: Map<string, string>
  requirePassword: boolean
  selectedGroupIds: Array<string>
  setSelectedGroupIds: React.Dispatch<React.SetStateAction<Array<string>>>
}) {
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
              <FieldLabel htmlFor="single-username">Username</FieldLabel>
              <FieldContent>
                <Input
                  id="single-username"
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

      {requirePassword ? (
        <form.Field
          name="password"
          validators={{
            onSubmit: requiredPasswordSchema,
          }}
        >
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="single-password">Password</FieldLabel>
                <FieldContent>
                  <Input
                    id="single-password"
                    type="password"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Password123!"
                    aria-invalid={isInvalid}
                  />
                </FieldContent>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        </form.Field>
      ) : null}

      <UserDialogGroupAssignmentsField
        id="single-group-assignments"
        groupItems={groupItems}
        groupOptionMap={groupOptionMap}
        selectedGroupIds={selectedGroupIds}
        setSelectedGroupIds={setSelectedGroupIds}
      />

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
              id="single-description"
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
