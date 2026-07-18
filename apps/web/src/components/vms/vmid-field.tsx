import { z } from "zod"
import {
  Field,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import type { ComponentType } from "react"
import {
  getFirstIssueMessage,
  parseNumberInput,
} from "@/features/vms/components/create/create-vm-form"
import { formatFieldError } from "@/components/forms/form-errors"
import { validateVMID } from "@/features/vms/api/vm-api"

export const optionalVmidSchema = z.union([
  z.literal(0),
  z.number().int().min(100, "VM ID must be at least 100"),
])

export type VMIDFieldProps = {
  FieldComponent: ComponentType<any>
  fieldName: string
  inputId: string
}

export function VMIDField({ FieldComponent, fieldName, inputId }: VMIDFieldProps) {
  return (
    <FieldComponent
      name={fieldName}
      validators={{
        onBlur: ({ value }: { value: number }) =>
          getFirstIssueMessage(optionalVmidSchema.safeParse(value)),
        onBlurAsync: async ({ value }: { value: number }) => {
          if (value === 0) return undefined
          try {
            const valid = await validateVMID(value)
            return valid ? undefined : "VM ID is already in use"
          } catch (error) {
            return error instanceof Error
              ? error.message
              : "Failed to validate VM ID"
          }
        },
      }}
    >
      {(field: any) => (
        <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
          <FieldLabel htmlFor={inputId}>VMID</FieldLabel>
          <Input
            id={inputId}
            type="number"
            value={field.state.value || ""}
            placeholder="Next (Default)"
            onBlur={field.handleBlur}
            onChange={(event) =>
              field.handleChange(parseNumberInput(event.target.value, 0))
            }
            aria-invalid={field.state.meta.errors.length > 0 || undefined}
          />
          <FieldError>
            {formatFieldError(field.state.meta.errors[0])}
          </FieldError>
        </Field>
      )}
    </FieldComponent>
  )
}
