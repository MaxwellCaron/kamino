import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import type { CreatePodFormApi } from "./create-pod-form"

type CreatePodPersonalizeSectionProps = {
  form: CreatePodFormApi
  submissionAttempts: number
}

export function CreatePodPersonalizeSection({
  form,
  submissionAttempts,
}: CreatePodPersonalizeSectionProps) {
  return (
    <FieldSet className="w-full">
      <FieldGroup>
        <form.Field name="name">
          {(field) => {
            const showValidation =
              field.state.meta.isTouched || submissionAttempts > 0
            const isInvalid = showValidation && !field.state.meta.isValid

            return (
              <Field data-invalid={isInvalid || undefined}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="text"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid || undefined}
                  placeholder="cis3670-01-lab"
                  autoComplete="off"
                />
                <FieldDescription>
                  Choose a unique name for your new pod. The name can only
                  contain ASCII letters, digits, and the characters -, and _.
                </FieldDescription>
                <FieldError
                  errors={showValidation ? field.state.meta.errors : []}
                />
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>
    </FieldSet>
  )
}
