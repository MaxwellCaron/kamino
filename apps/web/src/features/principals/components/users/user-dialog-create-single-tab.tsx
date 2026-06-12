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
import type React from "react"
import type { UserFormApi } from "@/features/principals/components/users/user-dialog-utils"
import {
  usernameSchema,
  validateDescription,
  validateRequiredPassword,
} from "@/features/principals/components/users/user-dialog-utils"
import { UserDialogGroupAssignmentsField } from "@/features/principals/components/users/user-dialog-group-assignments-field"

export function UserDialogCreateSingleTab({
  form,
  groupItems,
  groupOptionMap,
  selectedGroupIds,
  setSelectedGroupIds,
}: {
  form: UserFormApi
  groupItems: Array<string>
  groupOptionMap: Map<string, string>
  selectedGroupIds: Array<string>
  setSelectedGroupIds: React.Dispatch<React.SetStateAction<Array<string>>>
}) {
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
            <FieldLabel htmlFor="single-username">Username</FieldLabel>
            <FieldContent>
              <Input
                id="single-username"
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
          onBlur: ({ value }) => validateRequiredPassword(value),
        }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <FieldLabel htmlFor="single-password">Password</FieldLabel>
            <FieldContent>
              <Input
                id="single-password"
                type="password"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="Password123!"
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
              />
            </FieldContent>
            <FieldError>{field.state.meta.errors[0]}</FieldError>
          </Field>
        )}
      </form.Field>

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
          onBlur: ({ value }) => validateDescription(value),
        }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <FieldLabel htmlFor="single-description">Description</FieldLabel>
            <FieldContent>
              <Textarea
                id="single-description"
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
