import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import {
  createVmFormOptions,
  getFirstIssueMessage,
  getSelectedTemplate,
  optionalVmNameSchema,
  optionalVmidSchema,
  parseNumberInput,
  withCreateVmForm,
} from "./create-vm-form"
import { renderError } from "./create-vm-step-shared"
import type { VmTemplateOption } from "./create-vm-form"
import type { ApiNode } from "@/lib/queries"
import { validateVMID } from "@/lib/queries"

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
                    itemToStringValue={(template) => template.label}
                    value={
                      getSelectedTemplate(
                        templateOptions,
                        field.state.value ?? ""
                      ) ?? null
                    }
                    onValueChange={(template) =>
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
                        {(template) => (
                          <ComboboxItem key={template.id} value={template}>
                            {template.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  <FieldError>
                    {renderError(field.state.meta.errors[0])}
                  </FieldError>
                </Field>
              )}
            </form.AppField>

            <form.AppField name="full_clone">
              {(field) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="template-full-clone"
                    checked={field.state.value}
                    onCheckedChange={(checked) =>
                      field.handleChange(Boolean(checked))
                    }
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="template-full-clone">
                      Full clone
                    </FieldLabel>
                    <FieldDescription>
                      Linked clones are faster, but they depend on the source
                      template.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            </form.AppField>

            <FieldSeparator />

            <form.AppField
              name="name"
              validators={{
                onBlur: ({ value }) =>
                  getFirstIssueMessage(optionalVmNameSchema.safeParse(value)),
              }}
            >
              {(field) => (
                <Field
                  data-invalid={field.state.meta.errors.length > 0 || undefined}
                >
                  <FieldLabel htmlFor="template-name">Name</FieldLabel>
                  <Input
                    id="template-name"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder="Name of template (Default)"
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  />
                  <FieldError>
                    {renderError(field.state.meta.errors[0])}
                  </FieldError>
                </Field>
              )}
            </form.AppField>

            <div className="grid grid-cols-2 gap-6">
              <form.AppField name="node">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="template-node">Node</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => field.handleChange(value ?? "")}
                    >
                      <SelectTrigger id="template-node">
                        <SelectValue placeholder="Optimal (Default)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Nodes</SelectLabel>
                          <SelectItem value="">Optimal (Default)</SelectItem>
                          {nodes.map((node) => (
                            <SelectItem key={node.node} value={node.node}>
                              {node.node}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </form.AppField>

              <form.AppField
                name="vmid"
                validators={{
                  onBlur: ({ value }) =>
                    getFirstIssueMessage(optionalVmidSchema.safeParse(value)),
                  onBlurAsync: async ({ value }) => {
                    if (value === 0) return undefined
                    try {
                      const valid = await validateVMID(value)
                      return valid ? undefined : "VM ID is already in use"
                    } catch (error) {
                      return error instanceof Error
                        ? error.message
                        : "Failed to validate VM ID"
                    }
                  },
                }}
              >
                {(field) => (
                  <Field
                    data-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                  >
                    <FieldLabel htmlFor="template-vmid">VMID</FieldLabel>
                    <Input
                      id="template-vmid"
                      type="number"
                      value={field.state.value || ""}
                      placeholder="Next (Default)"
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          parseNumberInput(event.target.value, 0)
                        )
                      }
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                    />
                    <FieldError>
                      {renderError(field.state.meta.errors[0])}
                    </FieldError>
                  </Field>
                )}
              </form.AppField>
            </div>
          </FieldGroup>
        </FieldSet>
      </div>
    )
  },
})
