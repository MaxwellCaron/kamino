import React from "react"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@workspace/ui/components/field"
import { CreatePodTemplateCard } from "./create-pod-template-card"
import { syncSelectedTemplates, templateOptions } from "./create-pod-form"
import type { CreatePodFormApi } from "./create-pod-form"

type CreatePodVirtualMachinesSectionProps = {
  form: CreatePodFormApi
  submissionAttempts: number
}

export function CreatePodVirtualMachinesSection({
  form,
  submissionAttempts,
}: CreatePodVirtualMachinesSectionProps) {
  const anchor = useComboboxAnchor()

  return (
    <FieldSet className="w-full">
      <FieldGroup>
        <form.Field name="includeRouter">
          {(field) => {
            const showValidation =
              field.state.meta.isTouched || submissionAttempts > 0
            const isInvalid = showValidation && !field.state.meta.isValid

            return (
              <Field
                orientation="horizontal"
                data-invalid={isInvalid || undefined}
              >
                <Checkbox
                  id={field.name}
                  name={field.name}
                  checked={field.state.value}
                  onCheckedChange={(checked) =>
                    field.handleChange(checked === true)
                  }
                  onBlur={field.handleBlur}
                  aria-invalid={isInvalid || undefined}
                />
                <FieldContent>
                  <FieldLabel htmlFor={field.name}>
                    Include Router
                    <span className="text-muted-foreground">(Recommended)</span>
                  </FieldLabel>
                  <FieldDescription>
                    Automatically add a router VM to provide networking for this
                    template via 1-1 NATing.
                  </FieldDescription>
                  <FieldError
                    errors={showValidation ? field.state.meta.errors : []}
                  />
                </FieldContent>
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="templates" mode="array">
          {(field) => {
            const showValidation =
              field.state.meta.isTouched || submissionAttempts > 0
            const isInvalid = showValidation && !field.state.meta.isValid
            const selectedTemplates = field.state.value.map(
              (template) => template.template
            )

            return (
              <Field data-invalid={isInvalid || undefined}>
                <FieldLabel htmlFor="templates">Templates</FieldLabel>
                <Combobox
                  multiple
                  autoHighlight
                  items={templateOptions}
                  value={selectedTemplates}
                  onValueChange={(value) => {
                    field.handleChange(
                      syncSelectedTemplates(
                        field.state.value,
                        Array.isArray(value) ? value : []
                      )
                    )
                  }}
                >
                  <ComboboxChips
                    ref={anchor}
                    className="w-full"
                    aria-invalid={isInvalid || undefined}
                  >
                    <ComboboxValue>
                      {(values) => (
                        <React.Fragment>
                          {values.map((value: string) => (
                            <ComboboxChip key={value}>{value}</ComboboxChip>
                          ))}
                          <ComboboxChipsInput
                            id="templates"
                            name={field.name}
                            placeholder="Search templates"
                            onBlur={field.handleBlur}
                          />
                        </React.Fragment>
                      )}
                    </ComboboxValue>
                  </ComboboxChips>
                  <ComboboxContent anchor={anchor}>
                    <ComboboxEmpty>No items found.</ComboboxEmpty>
                    <ComboboxList>
                      {(item) => (
                        <ComboboxItem key={item} value={item}>
                          {item}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <FieldDescription>
                  Choose from available Proxmox templates and set quantities
                  (max 3 per template), or skip to continue without VMs.
                </FieldDescription>
                <FieldError
                  errors={showValidation ? field.state.meta.errors : []}
                />

                {field.state.value.length > 0 && (
                  <div className="flex flex-col gap-4 pt-6">
                    {field.state.value.map((templateConfig, index) => (
                      <CreatePodTemplateCard
                        key={templateConfig.template}
                        form={form}
                        templateConfig={templateConfig}
                        templateIndex={index}
                        submissionAttempts={submissionAttempts}
                      />
                    ))}
                  </div>
                )}
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>
    </FieldSet>
  )
}
