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
import { syncSelectedTemplates } from "./create-pod-form"
import type { CreatePodFormApi } from "./create-pod-form"
import type { PodTemplateOption } from "@/features/pods/api/create-pod-api"

type CreatePodVirtualMachinesSectionProps = {
  form: CreatePodFormApi
  submissionAttempts: number
  templateOptions: Array<PodTemplateOption>
  routerTemplateConfigured?: boolean
}

export function CreatePodVirtualMachinesSection({
  form,
  submissionAttempts,
  templateOptions,
  routerTemplateConfigured = true,
}: CreatePodVirtualMachinesSectionProps) {
  const anchor = useComboboxAnchor()
  const templateIds = templateOptions.map((template) => template.id)
  const templateNamesById = new Map(
    templateOptions.map((template) => [template.id, template.name])
  )

  return (
    <FieldSet className="w-full">
      <FieldGroup>
        <form.Field name="includeRouter">
          {(field) => {
            const showValidation =
              field.state.meta.isTouched || submissionAttempts > 0
            const isInvalid = showValidation && !field.state.meta.isValid

            return (
              <FieldLabel
                htmlFor={field.name}
                data-disabled={!routerTemplateConfigured || undefined}
                className="cursor-pointer data-[disabled=true]:cursor-not-allowed"
              >
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
                      {routerTemplateConfigured
                        ? "Automatically add a router VM to provide networking for this template via 1-1 NATing."
                        : "Router automation is unavailable until an admin configures a router VM template."}
                    </FieldDescription>
                    <FieldError
                      errors={showValidation ? field.state.meta.errors : []}
                    />
                  </FieldContent>
                  <Switch
                    id={field.name}
                    name={field.name}
                    checked={field.state.value}
                    disabled={!routerTemplateConfigured}
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
              (template) => template.templateItemId
            )

            return (
              <Field data-invalid={isInvalid || undefined}>
                <FieldLabel htmlFor="templates">Templates</FieldLabel>
                <Combobox
                  multiple
                  autoHighlight
                  items={templateIds}
                  value={selectedTemplates}
                  onValueChange={(value) => {
                    field.handleChange(
                      syncSelectedTemplates(
                        field.state.value,
                        Array.isArray(value) ? value : [],
                        templateOptions
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
                            <ComboboxChip key={value}>
                              {templateNamesById.get(value) ?? value}
                            </ComboboxChip>
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
                          {templateNamesById.get(item) ?? item}
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
                        key={templateConfig.templateItemId}
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
                        <IconTemplate className="text-muted-foreground" />
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
