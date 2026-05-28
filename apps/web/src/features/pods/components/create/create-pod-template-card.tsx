import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { Item, ItemGroup } from "@workspace/ui/components/item"
import {
  IconCpu,
  IconDatabase,
  IconDeviceDesktop,
  IconPlus,
  IconTemplate,
  IconTopologyBus,
  IconX,
} from "@tabler/icons-react"
import { createTemplateVm, toNumberInputValue } from "./create-pod-form"
import type { ReactNode } from "react"
import type { CreatePodFormApi, CreatePodFormValues } from "./create-pod-form"

type CreatePodTemplateCardProps = {
  form: CreatePodFormApi
  templateConfig: CreatePodFormValues["templates"][number]
  templateIndex: number
  submissionAttempts: number
}

type CreatePodVmNumberFieldProps = {
  form: CreatePodFormApi
  name:
    | `templates[${number}].vms[${number}].cpuCount`
    | `templates[${number}].vms[${number}].memoryGb`
    | `templates[${number}].vms[${number}].storageGb`
  label: string
  placeholder: string
  min: number
  max: number
  unit: string
  icon: ReactNode
  submissionAttempts: number
}

function CreatePodVmNumberField({
  form,
  name,
  label,
  placeholder,
  min,
  max,
  unit,
  icon,
  submissionAttempts,
}: CreatePodVmNumberFieldProps) {
  return (
    <form.Field name={name}>
      {(field) => {
        const showValidation =
          field.state.meta.isTouched || submissionAttempts > 0
        const isInvalid = showValidation && !field.state.meta.isValid

        return (
          <Field className="gap-2" data-invalid={isInvalid || undefined}>
            <FieldLabel
              htmlFor={field.name}
              className="text-xs text-muted-foreground"
            >
              {label}
            </FieldLabel>
            <InputGroup>
              <InputGroupAddon>{icon}</InputGroupAddon>
              <InputGroupInput
                id={field.name}
                name={field.name}
                type="number"
                value={field.state.value || ""}
                onBlur={field.handleBlur}
                onChange={(event) =>
                  field.handleChange(toNumberInputValue(event.target.value))
                }
                aria-invalid={isInvalid || undefined}
                placeholder={placeholder}
                min={min}
                max={max}
              />
              <InputGroupAddon align="inline-end" className="hidden sm:block">
                {unit}
              </InputGroupAddon>
            </InputGroup>
            <FieldError
              errors={showValidation ? field.state.meta.errors : []}
            />
          </Field>
        )
      }}
    </form.Field>
  )
}

export function CreatePodTemplateCard({
  form,
  templateConfig,
  templateIndex,
  submissionAttempts,
}: CreatePodTemplateCardProps) {
  return (
    <form.Field name={`templates[${templateIndex}].vms`} mode="array">
      {(vmsField) => {
        const showVmValidation =
          vmsField.state.meta.isTouched || submissionAttempts > 0
        const isVmInvalid = showVmValidation && !vmsField.state.meta.isValid

        return (
          <Card data-invalid={isVmInvalid || undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconTemplate className="text-muted-foreground" />
                <span>{templateConfig.template}</span>
              </CardTitle>
              <CardDescription>
                Add up to 3 VMs for this template and configure their settings.
              </CardDescription>
              <CardAction>
                <Button
                  type="button"
                  disabled={vmsField.state.value.length >= 3}
                  onClick={() => vmsField.pushValue(createTemplateVm())}
                >
                  <IconPlus data-icon="inline-start" />
                  Add VM
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldError
                  errors={showVmValidation ? vmsField.state.meta.errors : []}
                />
                <ItemGroup>
                  {vmsField.state.value.map((vm, vmIndex) => (
                    <Item
                      key={vm.id}
                      variant="muted"
                      className="flex-col items-stretch p-3 sm:p-4"
                    >
                      <div className="flex justify-between gap-3">
                        <form.Field
                          name={`templates[${templateIndex}].vms[${vmIndex}].name`}
                        >
                          {(vmNameField) => {
                            const showValidation =
                              vmNameField.state.meta.isTouched ||
                              submissionAttempts > 0
                            const isInvalid =
                              showValidation && !vmNameField.state.meta.isValid

                            return (
                              <Field
                                className="max-w-xs gap-2"
                                data-invalid={isInvalid || undefined}
                              >
                                <FieldLabel
                                  htmlFor={vmNameField.name}
                                  className="sr-only"
                                >
                                  VM name
                                </FieldLabel>
                                <InputGroup>
                                  <InputGroupAddon>
                                    <IconDeviceDesktop className="text-muted-foreground" />
                                  </InputGroupAddon>
                                  <InputGroupInput
                                    id={vmNameField.name}
                                    name={vmNameField.name}
                                    value={vmNameField.state.value}
                                    onBlur={vmNameField.handleBlur}
                                    onChange={(event) =>
                                      vmNameField.handleChange(
                                        event.target.value
                                      )
                                    }
                                    aria-invalid={isInvalid || undefined}
                                    placeholder={`virtual-machine-${vmIndex + 1}`}
                                    autoComplete="off"
                                  />
                                </InputGroup>
                                <FieldError
                                  errors={
                                    showValidation
                                      ? vmNameField.state.meta.errors
                                      : []
                                  }
                                />
                              </Field>
                            )
                          }}
                        </form.Field>
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-xs"
                          aria-label={`Remove ${vm.name || `VM ${vmIndex + 1}`}`}
                          onClick={() => vmsField.removeValue(vmIndex)}
                        >
                          <IconX />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                        <CreatePodVmNumberField
                          form={form}
                          name={`templates[${templateIndex}].vms[${vmIndex}].cpuCount`}
                          label="CPU"
                          placeholder="2"
                          min={1}
                          max={8}
                          unit="vCPU"
                          icon={<IconCpu />}
                          submissionAttempts={submissionAttempts}
                        />
                        <CreatePodVmNumberField
                          form={form}
                          name={`templates[${templateIndex}].vms[${vmIndex}].memoryGb`}
                          label="Memory"
                          placeholder="4"
                          min={1}
                          max={32}
                          unit="GB"
                          icon={<IconTopologyBus className="rotate-180" />}
                          submissionAttempts={submissionAttempts}
                        />
                        <CreatePodVmNumberField
                          form={form}
                          name={`templates[${templateIndex}].vms[${vmIndex}].storageGb`}
                          label="Storage"
                          placeholder="50"
                          min={10}
                          max={100}
                          unit="GB"
                          icon={<IconDatabase />}
                          submissionAttempts={submissionAttempts}
                        />
                      </div>
                    </Item>
                  ))}
                </ItemGroup>
              </FieldGroup>
            </CardContent>
          </Card>
        )
      }}
    </form.Field>
  )
}
