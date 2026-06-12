import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field"
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
  StorageOption,
  StringFieldApi,
} from "@/features/vms/components/hardware/hardware-dialog-schema"
import { formatFieldError } from "@/features/vms/components/create/create-vm-step-utils"
import {
  getFirstIssueMessage,
  parseNumberInput,
} from "@/features/vms/components/create/create-vm-form"
import { vmHardwareFormSchema } from "@/features/vms/components/hardware/hardware-dialog-schema"

export function VmHardwareStorageFields({
  form,
  minimumDiskSize,
  storageOptions,
}: {
  form: HardwareFormLike
  minimumDiskSize: number
  storageOptions: Array<StorageOption>
}) {
  return (
    <>
      <form.Field name="storage">
        {(field: StringFieldApi) => (
          <Field>
            <FieldLabel>Disk</FieldLabel>
            <Select value={field.state.value} disabled onValueChange={() => {}}>
              <SelectTrigger>
                <SelectValue>{field.state.value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {storageOptions.map((storage) => (
                    <SelectItem key={storage.storage} value={storage.storage}>
                      {storage.storage}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Disk moves are not supported in this dialog yet.
            </FieldDescription>
          </Field>
        )}
      </form.Field>

      <form.Field
        name="disk_size"
        validators={{
          onBlur: ({ value }: { value: number }) => {
            const issue = getFirstIssueMessage(
              vmHardwareFormSchema.shape.disk_size.safeParse(value)
            )
            if (issue) return issue
            if (value < minimumDiskSize) {
              return `Disk size must be at least ${minimumDiskSize} GB.`
            }
            return undefined
          },
        }}
      >
        {(field: NumberFieldApi) => (
          <Field data-invalid={field.state.meta.errors.length > 0 || undefined}>
            <FieldLabel htmlFor="hardware-disk-size">Capacity (GB)</FieldLabel>
            <Input
              id="hardware-disk-size"
              type="number"
              min={1}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) =>
                field.handleChange(
                  parseNumberInput(event.target.value, field.state.value)
                )
              }
              aria-invalid={field.state.meta.errors.length > 0 || undefined}
            />
            <FieldDescription>
              Existing disks can only be expanded from {minimumDiskSize} GB.
            </FieldDescription>
            <FieldError>
              {formatFieldError(field.state.meta.errors[0])}
            </FieldError>
          </Field>
        )}
      </form.Field>
    </>
  )
}
