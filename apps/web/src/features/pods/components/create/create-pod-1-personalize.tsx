import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { podNameSchema } from "./create-pod-form"
import type { CreatePodFormApi } from "./create-pod-form"
import { validatePodNameAvailability } from "@/features/pods/api/create-pod-api"
import { replaceWhitespaceWithHyphen } from "@/features/shared/utils/sanitize"

const podNameConflictError = {
  message: "A Pod with this name already exists.",
}

async function validateUniquePodName(value: string, signal: AbortSignal) {
  const result = podNameSchema.safeParse(value)
  if (!result.success) return undefined

  const availability = await validatePodNameAvailability(result.data, signal)
  return availability.available ? undefined : podNameConflictError
}

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
        <form.Field
          name="name"
          validators={{
            onChangeAsyncDebounceMs: 600,
            onChangeAsync: ({ signal, value }) =>
              validateUniquePodName(value, signal),
            onBlurAsync: ({ signal, value }) =>
              validateUniquePodName(value, signal),
            onSubmitAsync: ({ signal, value }) =>
              validateUniquePodName(value, signal),
          }}
        >
          {(field) => {
            const hasAsyncValidationError = Boolean(
              field.state.meta.errorMap.onChange ||
              field.state.meta.errorMap.onBlur ||
              field.state.meta.errorMap.onSubmit
            )
            const showValidation =
              field.state.meta.isTouched ||
              hasAsyncValidationError ||
              submissionAttempts > 0
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
                  onChange={(event) =>
                    field.handleChange(
                      replaceWhitespaceWithHyphen(event.target.value)
                    )
                  }
                  aria-invalid={isInvalid || undefined}
                  placeholder="cis3670-01-lab"
                  autoComplete="off"
                />
                <FieldDescription>
                  {field.state.meta.isValidating
                    ? "Checking whether this Pod name is available."
                    : "Choose a unique name for your new pod. The name can only contain ASCII letters, digits, and -."}
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
