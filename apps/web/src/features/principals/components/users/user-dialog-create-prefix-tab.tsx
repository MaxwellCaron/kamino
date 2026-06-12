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
  parsePositiveInteger,
  validateDescription,
  validateRequiredPassword,
} from "@/features/principals/components/users/user-dialog-utils"
import { UserDialogGroupAssignmentsField } from "@/features/principals/components/users/user-dialog-group-assignments-field"

export function UserDialogCreatePrefixTab({
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
        name="prefix"
        validators={{
          onBlur: ({ value }) =>
            value.trim() ? undefined : "Prefix is required",
        }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <FieldLabel htmlFor="prefix">Prefix</FieldLabel>
            <FieldContent>
              <Input
                id="prefix"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="user"
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
              />
            </FieldContent>
            <FieldDescription>
              Generated usernames use the prefix plus a padded number. i.e.
              user01, user02, user3.
            </FieldDescription>
            <FieldError>{field.state.meta.errors[0]}</FieldError>
          </Field>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-6">
        <form.Field
          name="start"
          validators={{
            onBlur: ({ value }) =>
              (() => {
                try {
                  parsePositiveInteger(value, "Starting number")
                  return undefined
                } catch (error) {
                  return error instanceof Error
                    ? error.message
                    : "Starting number is invalid"
                }
              })(),
          }}
        >
          {(field) => (
            <Field
              data-invalid={field.state.meta.errors.length > 0 || undefined}
            >
              <FieldLabel htmlFor="start">Starting Number</FieldLabel>
              <FieldContent>
                <Input
                  id="start"
                  min={1}
                  step={1}
                  type="number"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                />
              </FieldContent>
              <FieldError>{field.state.meta.errors[0]}</FieldError>
            </Field>
          )}
        </form.Field>

        <form.Field
          name="quantity"
          validators={{
            onBlur: ({ value }) =>
              (() => {
                try {
                  parsePositiveInteger(value, "Quantity")
                  return undefined
                } catch (error) {
                  return error instanceof Error
                    ? error.message
                    : "Quantity is invalid"
                }
              })(),
          }}
        >
          {(field) => (
            <Field
              data-invalid={field.state.meta.errors.length > 0 || undefined}
            >
              <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
              <FieldContent>
                <Input
                  id="quantity"
                  min={1}
                  max={50}
                  step={1}
                  type="number"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                />
              </FieldContent>
              <FieldError>{field.state.meta.errors[0]}</FieldError>
            </Field>
          )}
        </form.Field>
      </div>

      <form.Field
        name="sharedPassword"
        validators={{
          onBlur: ({ value }) => validateRequiredPassword(value),
        }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <FieldLabel htmlFor="shared-password">Shared Password</FieldLabel>
            <FieldContent>
              <Input
                id="shared-password"
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
        id="prefix-group-assignments"
        groupItems={groupItems}
        groupOptionMap={groupOptionMap}
        selectedGroupIds={selectedGroupIds}
        setSelectedGroupIds={setSelectedGroupIds}
      />

      <form.Field
        name="prefixDescription"
        validators={{
          onBlur: ({ value }) => validateDescription(value),
        }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <FieldLabel htmlFor="prefix-description">Description</FieldLabel>
            <FieldContent>
              <Textarea
                id="prefix-description"
                maxLength={256}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="Optional shared description"
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
