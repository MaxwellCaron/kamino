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
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { Item, ItemGroup } from "@workspace/ui/components/item"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Cancel01Icon,
  ComputerIcon,
  Copy02Icon,
  CpuIcon,
  Delete01Icon,
  HardDriveIcon,
  RamMemoryIcon,
} from "@hugeicons/core-free-icons"
import { createTemplateVm, toNumberInputValue } from "./create-pod-form"
import type { ReactNode } from "react"
import type {
  CreatePodFormApi,
  CreatePodFormValues,
  PodNetworkingMode,
} from "./create-pod-form"
import type { PodNetworkSegment } from "@/features/pods/api/create-pod-api"
import { replaceWhitespaceWithHyphen } from "@/features/shared/utils/sanitize"

type CreatePodTemplateCardProps = {
  form: CreatePodFormApi
  templateConfig: CreatePodFormValues["templates"][number]
  templateIndex: number
  submissionAttempts: number
  networkingMode: PodNetworkingMode
  networkSegments: Array<PodNetworkSegment>
  onRemoveTemplate: () => void
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

function getMinimumStorageGb(
  templateConfig: CreatePodFormValues["templates"][number]
) {
  return Math.min(100, Math.max(10, Math.ceil(templateConfig.templateDiskGb)))
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
  networkingMode,
  networkSegments,
  onRemoveTemplate,
}: CreatePodTemplateCardProps) {
  return (
    <form.Field name={`templates[${templateIndex}].vms`} mode="array">
      {(vmsField) => {
        const vmsValue: unknown = vmsField.state.value
        const vms: CreatePodFormValues["templates"][number]["vms"] =
          Array.isArray(vmsValue) ? vmsValue : []
        const showVmValidation =
          vmsField.state.meta.isTouched || submissionAttempts > 0
        const isVmInvalid = showVmValidation && !vmsField.state.meta.isValid

        return (
          <Card data-invalid={isVmInvalid || undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={Copy02Icon}
                  className="text-muted-foreground"
                />
                <span>{templateConfig.templateName}</span>
              </CardTitle>
              <CardDescription>
                Add up to 5 VMs for this template and configure their settings.
              </CardDescription>
              <CardAction className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={onRemoveTemplate}
                  aria-label={`Delete ${templateConfig.templateName} template`}
                >
                  <HugeiconsIcon icon={Delete01Icon} data-icon="inline-start" />
                  <span className="hidden md:block">Delete</span>
                </Button>
                <Button
                  type="button"
                  disabled={vms.length >= 5}
                  onClick={() =>
                    vmsField.pushValue(
                      createTemplateVm(
                        {
                          name: templateConfig.templateName,
                          disk_gb: templateConfig.templateDiskGb,
                        },
                        networkingMode === "lan-dmz-router-v1"
                          ? { segmentKey: "lan" }
                          : undefined
                      )
                    )
                  }
                >
                  <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
                  <span className="hidden md:block">Add VM</span>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldError
                  className="text-center"
                  errors={showVmValidation ? vmsField.state.meta.errors : []}
                />
                <ItemGroup>
                  {vms.map((vm, vmIndex) => (
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
                                    <HugeiconsIcon
                                      icon={ComputerIcon}
                                      className="text-muted-foreground"
                                    />
                                  </InputGroupAddon>
                                  <InputGroupInput
                                    id={vmNameField.name}
                                    name={vmNameField.name}
                                    value={vmNameField.state.value}
                                    onBlur={vmNameField.handleBlur}
                                    onChange={(event) =>
                                      vmNameField.handleChange(
                                        replaceWhitespaceWithHyphen(
                                          event.target.value
                                        )
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
                          <HugeiconsIcon icon={Cancel01Icon} />
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-2 sm:gap-4">
                        <CreatePodVmNumberField
                          form={form}
                          name={`templates[${templateIndex}].vms[${vmIndex}].cpuCount`}
                          label="CPU"
                          placeholder="2"
                          min={1}
                          max={8}
                          unit="vCPU"
                          icon={<HugeiconsIcon icon={CpuIcon} />}
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
                          icon={<HugeiconsIcon icon={RamMemoryIcon} />}
                          submissionAttempts={submissionAttempts}
                        />
                        <CreatePodVmNumberField
                          form={form}
                          name={`templates[${templateIndex}].vms[${vmIndex}].storageGb`}
                          label="Storage"
                          placeholder="50"
                          min={getMinimumStorageGb(templateConfig)}
                          max={100}
                          unit="GB"
                          icon={<HugeiconsIcon icon={HardDriveIcon} />}
                          submissionAttempts={submissionAttempts}
                        />
                      </div>

                      {networkingMode === "lan-dmz-router-v1" ? (
                        <form.Field
                          name={`templates[${templateIndex}].vms[${vmIndex}].segmentKey`}
                        >
                          {(segmentField) => {
                            const showValidation =
                              segmentField.state.meta.isTouched ||
                              submissionAttempts > 0
                            const isInvalid =
                              showValidation && !segmentField.state.meta.isValid

                            return (
                              <Field data-invalid={isInvalid || undefined}>
                                <FieldLabel className="text-xs text-muted-foreground">
                                  Network Segment
                                </FieldLabel>
                                <RadioGroup
                                  value={segmentField.state.value ?? ""}
                                  onValueChange={(value) =>
                                    segmentField.handleChange(
                                      value as "lan" | "dmz"
                                    )
                                  }
                                  className="grid gap-2 sm:grid-cols-2"
                                >
                                  {networkSegments.map((segment) => (
                                    <FieldLabel
                                      key={segment.key}
                                      htmlFor={`${segmentField.name}-${segment.key}`}
                                    >
                                      <Field orientation="horizontal">
                                        <FieldContent>
                                          <FieldTitle className="text-sm">
                                            {segment.label}
                                          </FieldTitle>
                                        </FieldContent>
                                        <RadioGroupItem
                                          id={`${segmentField.name}-${segment.key}`}
                                          value={segment.key}
                                          onBlur={segmentField.handleBlur}
                                        />
                                      </Field>
                                    </FieldLabel>
                                  ))}
                                </RadioGroup>
                                <FieldError
                                  errors={
                                    showValidation
                                      ? segmentField.state.meta.errors
                                      : []
                                  }
                                />
                              </Field>
                            )
                          }}
                        </form.Field>
                      ) : null}
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
