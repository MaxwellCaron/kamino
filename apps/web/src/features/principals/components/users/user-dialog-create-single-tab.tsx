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
  descriptionFieldSchema,
  requiredPasswordSchema,
  usernameSchema,
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
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="single-description">Description</FieldLabel>
              <FieldContent>
                <Textarea
                  id="single-description"
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
