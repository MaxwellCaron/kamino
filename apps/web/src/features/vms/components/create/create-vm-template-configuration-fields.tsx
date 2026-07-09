import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import {
  CloneFullCloneField,
  CloneNameField,
  CloneNodeField,
  CloneVmidField,
} from "./clone-form-fields"
import {
  createVmFormOptions,
  getSelectedTemplate,
  withCreateVmForm,
} from "./create-vm-form"
import { formatFieldError } from "./create-vm-step-utils"
import type { VmTemplateOption } from "./create-vm-form"
import type { ApiNode } from "@/features/vms/types/vm-types"

export const TemplateConfigurationFields = withCreateVmForm({
  ...createVmFormOptions,
  props: {
    templateOptions: [] as Array<VmTemplateOption>,
    nodes: [] as Array<ApiNode>,
  },
  render: function Render({ form, templateOptions, nodes }) {
    return (
      <div className="flex flex-col gap-6">
        <FieldSet>
          <FieldLegend>Template Source</FieldLegend>
          <FieldDescription>
            Select a template to clone into a new VM.
          </FieldDescription>
          <FieldGroup>
            <form.AppField name="template_id">
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel>Template</FieldLabel>
                  <Combobox
                    items={templateOptions}
                    itemToStringValue={(template: VmTemplateOption) =>
                      template.label
                    }
                    value={
                      getSelectedTemplate(
                        templateOptions,
                        field.state.value
                      ) ?? null
                    }
                    onValueChange={(template: VmTemplateOption | null) =>
                      field.handleChange(template?.name ?? "")
                    }
                    autoHighlight
                  >
                    <ComboboxInput
                      placeholder="ubuntu-26"
                      onBlur={field.handleBlur}
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>No templates found.</ComboboxEmpty>
                      <ComboboxList>
                        {(template: VmTemplateOption) => (
                          <ComboboxItem key={template.id} value={template}>
                            {template.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  <FieldError>
                    {formatFieldError(field.state.meta.errors[0])}
                  </FieldError>
                </Field>
              )}
            </form.AppField>

            <CloneNameField
              FieldComponent={form.AppField}
              fieldName="name"
              inputId="template-name"
              placeholder="Name of template (Default)"
            />

            <div className="grid grid-cols-2 gap-6">
              <CloneNodeField
                FieldComponent={form.AppField}
                fieldName="node"
                inputId="template-node"
                nodes={nodes}
              />
              <CloneVmidField
                FieldComponent={form.AppField}
                fieldName="vmid"
                inputId="template-vmid"
              />
            </div>

            <FieldSeparator />

            <CloneFullCloneField
              FieldComponent={form.AppField}
              fieldName="full_clone"
              inputId="template-full-clone"
              dependencyLabel="source template"
            />
          </FieldGroup>
        </FieldSet>
      </div>
    )
  },
})
