import { Field, FieldError, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import type {
  HardwareFormLike,
  NumberFieldApi,
  StringFieldApi,
} from "@/features/vms/components/hardware/hardware-dialog-schema"
import { formatFieldError } from "@/features/vms/components/create/create-vm-step-utils"
import {
  getFirstIssueMessage,
  parseNumberInput,
} from "@/features/vms/components/create/create-vm-form"
import { getSelectOptionLabel } from "@/features/vms/components/hardware/hardware-section-utils"
import { cpuTypes } from "@/features/vms/components/hardware/hardware-options"
import {
  VmHardwareCpuBlock,
  VmHardwareMemoryBlock,
} from "@/features/vms/components/hardware/hardware-sections"
import { vmHardwareFormSchema } from "@/features/vms/components/hardware/hardware-dialog-schema"

export function VmHardwareComputeFields({ form }: { form: HardwareFormLike }) {
  return (
    <>
      <VmHardwareCpuBlock>
        <div className="grid grid-cols-2 gap-6">
          <form.Field
            name="sockets"
            validators={{
              onBlur: ({ value }: { value: number }) =>
                getFirstIssueMessage(
                  vmHardwareFormSchema.shape.sockets.safeParse(value)
                ),
            }}
          >
            {(field: NumberFieldApi) => (
              <Field
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <FieldLabel htmlFor="hardware-sockets">Sockets</FieldLabel>
                <Input
                  id="hardware-sockets"
                  type="number"
                  min={1}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(parseNumberInput(event.target.value, 1))
                  }
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                />
                <FieldError>
                  {formatFieldError(field.state.meta.errors[0])}
                </FieldError>
              </Field>
            )}
          </form.Field>

          <form.Field
            name="cores"
            validators={{
              onBlur: ({ value }: { value: number }) =>
                getFirstIssueMessage(
                  vmHardwareFormSchema.shape.cores.safeParse(value)
                ),
            }}
          >
            {(field: NumberFieldApi) => (
              <Field
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <FieldLabel htmlFor="hardware-cores">Cores</FieldLabel>
                <Input
                  id="hardware-cores"
                  type="number"
                  min={1}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(parseNumberInput(event.target.value, 1))
                  }
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                />
                <FieldError>
                  {formatFieldError(field.state.meta.errors[0])}
                </FieldError>
              </Field>
            )}
          </form.Field>
        </div>

        <form.Field name="cpu_type">
          {(field: StringFieldApi) => (
            <Field>
              <FieldLabel>CPU Type</FieldLabel>
              <Select
                value={field.state.value}
                onValueChange={(value) =>
                  field.handleChange(value ?? "x86-64-v2-AES")
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {getSelectOptionLabel(cpuTypes, field.state.value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {cpuTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>
      </VmHardwareCpuBlock>

      <VmHardwareMemoryBlock balloonDescription='Set balloon to "0" to disable.'>
        <div className="grid grid-cols-2 gap-6">
          <form.Field
            name="memory"
            validators={{
              onBlur: ({ value }: { value: number }) =>
                getFirstIssueMessage(
                  vmHardwareFormSchema.shape.memory.safeParse(value)
                ),
            }}
          >
            {(field: NumberFieldApi) => (
              <Field
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <FieldLabel htmlFor="hardware-memory">Capacity (GB)</FieldLabel>
                <Input
                  id="hardware-memory"
                  type="number"
                  min={1}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) =>
                    field.handleChange(parseNumberInput(event.target.value, 2))
                  }
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                />
                <FieldError>
                  {formatFieldError(field.state.meta.errors[0])}
                </FieldError>
              </Field>
            )}
          </form.Field>

          <form.Field
            name="balloon"
            validators={{
              onBlur: ({ value }: { value: number }) =>
                getFirstIssueMessage(
                  vmHardwareFormSchema.shape.balloon.safeParse(value)
                ),
            }}
          >
            {(field: NumberFieldApi) => (
              <Field
                data-invalid={field.state.meta.errors.length > 0 || undefined}
              >
                <FieldLabel htmlFor="hardware-balloon">Balloon (GB)</FieldLabel>
                <Input
                  id="hardware-balloon"
                  type="number"
                  min={0}
                  value={field.state.value}
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
          </form.Field>
        </div>
      </VmHardwareMemoryBlock>
    </>
  )
}
