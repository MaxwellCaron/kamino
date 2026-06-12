import { Field, FieldLabel } from "@workspace/ui/components/field"
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
  StringFieldApi,
} from "@/features/vms/components/hardware/hardware-dialog-schema"
import { getSelectOptionLabel } from "@/features/vms/components/hardware/hardware-section-utils"
import {
  biosTypes,
  machineTypes,
  osTypes,
  scsiControllers,
} from "@/features/vms/components/hardware/hardware-options"

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
