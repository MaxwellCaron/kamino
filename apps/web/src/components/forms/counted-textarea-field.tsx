import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@workspace/ui/components/input-group"
import { cn } from "@workspace/ui/lib/utils"
import type { ComponentProps, ReactNode } from "react"

type CountedTextareaFieldProps = Omit<
  ComponentProps<typeof InputGroupTextarea>,
  "aria-invalid" | "children" | "onChange" | "value"
> & {
  id: string
  isInvalid?: boolean
  maxLength: number
  onValueChange: (value: string) => void
  value: string
}

type CountedTextareaInputGroupProps = CountedTextareaFieldProps

export function CountedTextareaInputGroup({
  className,
  id,
  isInvalid,
  maxLength,
  onValueChange,
  value,
  ...props
}: CountedTextareaInputGroupProps) {
  return (
    <InputGroup>
      <InputGroupTextarea
        id={id}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={isInvalid || undefined}
        maxLength={maxLength}
        className={cn("p-4", className)}
        {...props}
      />
      <InputGroupAddon
        align="block-end"
        className="justify-end px-4 font-mono text-xs"
      >
        <InputGroupText className="ml-auto">
          {value.length}/{maxLength}
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

type CountedTextareaFieldShellProps = CountedTextareaInputGroupProps & {
  errors?: ComponentProps<typeof FieldError>["errors"]
  fieldClassName?: string
  label: ReactNode
}

export function CountedTextareaField({
  errors,
  fieldClassName,
  label,
  ...props
}: CountedTextareaFieldShellProps) {
  return (
    <Field data-invalid={props.isInvalid || undefined} className={fieldClassName}>
      <FieldLabel htmlFor={props.id}>{label}</FieldLabel>
      <FieldContent>
        <CountedTextareaInputGroup {...props} />
        <FieldError errors={errors} />
      </FieldContent>
    </Field>
  )
}
