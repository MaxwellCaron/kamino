import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import type React from "react"
import type { UserFormApi } from "@/features/principals/components/users/user-dialog-utils"
import {
  descriptionFieldSchema,
  positiveIntegerStringSchema,
  prefixSchema,
  requiredPasswordSchema,
} from "@/features/principals/components/users/user-dialog-utils"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"
import { UserDialogGroupAssignmentsField } from "@/features/principals/components/users/user-dialog-group-assignments-field"

export function UserDialogCreatePrefixTab({
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
        name="prefix"
        validators={{
          onSubmit: prefixSchema,
        }}
      >
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="prefix">Prefix</FieldLabel>
              <FieldContent>
                <Input
                  id="prefix"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="user"
                  aria-invalid={isInvalid}
                />
              </FieldContent>
              <FieldDescription>
                Generated usernames use the prefix plus a padded number. i.e.
                user01, user02, user3.
              </FieldDescription>
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          )
        }}
      </form.Field>

      <div className="grid grid-cols-2 gap-6">
        <form.Field
          name="start"
          validators={{
            onSubmit: positiveIntegerStringSchema("Starting number"),
          }}
        >
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid}>
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
                    aria-invalid={isInvalid}
                  />
                </FieldContent>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        </form.Field>

        <form.Field
          name="quantity"
          validators={{
            onSubmit: positiveIntegerStringSchema("Quantity"),
          }}
        >
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid}>
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
                    aria-invalid={isInvalid}
                  />
                </FieldContent>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        </form.Field>
      </div>

      {requirePassword ? (
        <form.Field
          name="sharedPassword"
          validators={{
            onSubmit: requiredPasswordSchema,
          }}
        >
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="shared-password">Shared Password</FieldLabel>
                <FieldContent>
                  <Input
                    id="shared-password"
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
        id="prefix-group-assignments"
        groupItems={groupItems}
        groupOptionMap={groupOptionMap}
        selectedGroupIds={selectedGroupIds}
        setSelectedGroupIds={setSelectedGroupIds}
      />

      <form.Field
        name="prefixDescription"
        validators={{
          onSubmit: descriptionFieldSchema,
        }}
      >
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid

          return (
            <CountedTextareaField
              id="prefix-description"
              label="Description"
              placeholder="Optional shared description"
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
