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
import { formatFieldError } from "@/features/vms/components/create/create-vm-step-utils"
import {
  getFirstIssueMessage,
  parseNumberInput,
} from "@/features/vms/components/create/create-vm-form"
import { getSelectOptionLabel } from "@/features/vms/components/hardware/hardware-section-utils"
import {
  biosTypes,
  cpuTypes,
  machineTypes,
  osTypes,
  scsiControllers,
} from "@/features/vms/components/hardware/hardware-options"
import {
  VmHardwareCpuBlock,
  VmHardwareMemoryBlock,
} from "@/features/vms/components/hardware/hardware-sections"
import { vmHardwareFormSchema } from "@/features/vms/components/hardware/hardware-dialog-form"

type HardwareFormLike = {
  Field: any
}

type StorageOption = {
  storage: string
}

type StringFieldApi = {
  state: { value: string; meta?: { errors: Array<unknown> } }
  handleChange: (value: string) => void
}

type NumberFieldApi = {
  state: { value: number; meta: { errors: Array<unknown> } }
  handleBlur: () => void
  handleChange: (value: number) => void
}

export function VmHardwareOperatingSystemFields({
  form,
}: {
  form: HardwareFormLike
}) {
  return (
    <>
      <form.Field name="ostype">
        {(field: StringFieldApi) => (
          <Field>
            <FieldLabel>OS Type</FieldLabel>
            <Select
              value={field.state.value}
              onValueChange={(value) => field.handleChange(value ?? "other")}
            >
              <SelectTrigger>
                <SelectValue>
                  {getSelectOptionLabel(osTypes, field.state.value)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {osTypes.map((os) => (
                    <SelectItem key={os.value} value={os.value}>
                      {os.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-6">
        <form.Field name="bios">
          {(field: StringFieldApi) => (
            <Field>
              <FieldLabel>BIOS</FieldLabel>
              <Select
                value={field.state.value}
                onValueChange={(value) =>
                  field.handleChange(value ?? "seabios")
                }
              >
                <SelectTrigger>
                  <SelectValue>
                    {getSelectOptionLabel(biosTypes, field.state.value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {biosTypes.map((bios) => (
                      <SelectItem key={bios.value} value={bios.value}>
                        {bios.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>

        <form.Field name="machine">
          {(field: StringFieldApi) => (
            <Field>
              <FieldLabel>Machine Type</FieldLabel>
              <Select
                value={field.state.value}
                onValueChange={(value) => field.handleChange(value ?? "pc")}
              >
                <SelectTrigger>
                  <SelectValue>
                    {getSelectOptionLabel(machineTypes, field.state.value)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {machineTypes.map((machine) => (
                      <SelectItem key={machine.value} value={machine.value}>
                        {machine.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.Field>
      </div>

      <form.Field name="scsi">
        {(field: StringFieldApi) => (
          <Field>
            <FieldLabel>SCSI Controller</FieldLabel>
            <Select
              value={field.state.value}
              onValueChange={(value) =>
                field.handleChange(value ?? "virtio-scsi-single")
              }
            >
              <SelectTrigger>
                <SelectValue>
                  {getSelectOptionLabel(scsiControllers, field.state.value)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {scsiControllers.map((controller) => (
                    <SelectItem key={controller.value} value={controller.value}>
                      {controller.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.Field>
    </>
  )
}

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
