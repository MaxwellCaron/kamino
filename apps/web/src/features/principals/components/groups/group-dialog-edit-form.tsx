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
  groupNameSchema,
  validateDescription,
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
          onBlur: ({ value }) => {
            const result = groupNameSchema.safeParse(value)
            return result.success ? undefined : result.error.issues[0].message
          },
        }}
      >
        {(field) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="name"
                maxLength={64}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                placeholder="Admins"
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
