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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy02Icon } from "@hugeicons/core-free-icons"
import { CreatePodTemplateCard } from "./create-pod-template-card"
import {
  getPodDefaultVmSegmentKey,
  syncSelectedTemplates,
} from "./create-pod-form"
import type { CreatePodFormApi } from "./create-pod-form"
import type {
  PodNetworkProfile,
  PodTemplateOption,
} from "@/features/pods/api/create-pod-api"

type CreatePodVirtualMachinesSectionProps = {
  form: CreatePodFormApi
  submissionAttempts: number
  templateOptions: Array<PodTemplateOption>
  networkProfiles: Array<PodNetworkProfile>
}

export function CreatePodVirtualMachinesSection({
  form,
  submissionAttempts,
  templateOptions,
  networkProfiles,
}: CreatePodVirtualMachinesSectionProps) {
  const anchor = useComboboxAnchor()
  const templateOptionsById = new Map(
    templateOptions.map((template) => [template.id, template])
  )

  return (
    <FieldSet className="w-full">
      <FieldDescription>
        Choose from available Proxmox templates or skip to continue without VMs.
      </FieldDescription>
      <FieldGroup>
        <form.Field name="templates" mode="array">
          {(field) => {
            const showValidation =
              field.state.meta.isTouched || submissionAttempts > 0
            const isInvalid = showValidation && !field.state.meta.isValid
            const selectedTemplateOptions = field.state.value.flatMap(
              (template) => {
                const option = templateOptionsById.get(template.templateItemId)
                return option ? [option] : []
              }
            )
            const networkingMode = form.getFieldValue("networkingMode")
            const defaultSegmentKey = getPodDefaultVmSegmentKey(
              networkingMode,
              networkProfiles
            )
            const dmzProfile = networkProfiles.find(
              (profile) => profile.key === "lan-dmz-router-v1"
            )

            return (
              <Field data-invalid={isInvalid || undefined}>
                <FieldLabel htmlFor="templates">Templates</FieldLabel>
                <Combobox
                  multiple
                  autoHighlight
                  items={templateOptions}
                  itemToStringLabel={(template) => template.name}
                  itemToStringValue={(template) => template.name}
                  isItemEqualToValue={(a, b) => a.id === b.id}
                  value={selectedTemplateOptions}
                  onValueChange={(value) => {
                    const selectedTemplateIds = (
                      Array.isArray(value) ? value : []
                    ).map((template) => template.id)

                    field.handleChange(
                      syncSelectedTemplates(
                        field.state.value,
                        selectedTemplateIds,
                        templateOptions,
                        defaultSegmentKey ? { defaultSegmentKey } : undefined
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
                          {values.map((template: PodTemplateOption) => (
                            <ComboboxChip key={template.id}>
                              {template.name}
                            </ComboboxChip>
                          ))}
                          <ComboboxChipsInput
                            id="templates"
                            name={field.name}
                            placeholder="Search..."
                            onBlur={field.handleBlur}
                          />
                        </React.Fragment>
                      )}
                    </ComboboxValue>
                  </ComboboxChips>
                  <ComboboxContent anchor={anchor}>
                    <ComboboxEmpty>No items found.</ComboboxEmpty>
                    <ComboboxList>
                      {(template) => (
                        <ComboboxItem key={template.id} value={template}>
                          {template.name}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
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
                        networkingMode={networkingMode}
                        networkSegments={dmzProfile?.segments ?? []}
                        onRemoveTemplate={() => field.removeValue(index)}
                      />
                    ))}
                  </div>
                ) : (
                  <Empty className="mt-6 border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HugeiconsIcon
                          icon={Copy02Icon}
                          className="text-muted-foreground"
                        />
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
