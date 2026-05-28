import React from "react"
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
  FieldTitle,
} from "@workspace/ui/components/field"
import { Switch } from "@workspace/ui/components/switch"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { IconTemplate } from "@tabler/icons-react"
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
              <FieldLabel htmlFor={field.name}>
                <Field
                  orientation="horizontal"
                  data-invalid={isInvalid || undefined}
                >
                  <FieldContent>
                    <FieldTitle>
                      Include Router
                      <span className="text-muted-foreground">
                        (Recommended)
                      </span>
                    </FieldTitle>
                    <FieldDescription>
                      Automatically add a router VM to provide networking for
                      this template via 1-1 NATing.
                    </FieldDescription>
                    <FieldError
                      errors={showValidation ? field.state.meta.errors : []}
                    />
                  </FieldContent>
                  <Switch
                    id={field.name}
                    name={field.name}
                    checked={field.state.value}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                    onBlur={field.handleBlur}
                    aria-invalid={isInvalid || undefined}
                  />
                </Field>
              </FieldLabel>
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
                  Choose from available Proxmox templates or skip to continue
                  without VMs.
                </FieldDescription>
                <FieldError
                  errors={showValidation ? field.state.meta.errors : []}
                />

                {field.state.value.length > 0 ? (
                  <div className="flex flex-col gap-4 pt-6">
                    {field.state.value.map((templateConfig, index) => (
                      <CreatePodTemplateCard
                        key={templateConfig.template}
                        form={form}
                        templateConfig={templateConfig}
                        templateIndex={index}
                        submissionAttempts={submissionAttempts}
                        onRemoveTemplate={() => field.removeValue(index)}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty className="mt-6 border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <IconTemplate />
                      </EmptyMedia>
                      <EmptyTitle>No templates selected</EmptyTitle>
                      <EmptyDescription>
                        Select one or more templates to configure virtual
                        machines for this pod.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>
    </FieldSet>
  )
}
