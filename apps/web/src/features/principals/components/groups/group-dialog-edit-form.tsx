import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import type { GroupFormApi } from "@/features/principals/components/groups/group-dialog-utils"
import {
  descriptionFieldSchema,
  groupNameSchema,
} from "@/features/principals/components/groups/group-dialog-utils"
import { CountedTextareaField } from "@/components/forms/counted-textarea-field"

type GroupDialogEditFormProps = {
  form: GroupFormApi
}

export function GroupDialogEditForm({ form }: GroupDialogEditFormProps) {
  return (
    <FieldGroup>
      <form.Field
        name="name"
        validators={{
          onSubmit: groupNameSchema,
        }}
      >
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <FieldContent>
                <Input
                  id="name"
                  maxLength={64}
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Admins"
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
