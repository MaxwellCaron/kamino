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
import type { GroupFormApi } from "@/features/principals/components/groups/group-dialog-utils"
import {
  descriptionFieldSchema,
  groupNameSchema,
} from "@/features/principals/components/groups/group-dialog-utils"

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
