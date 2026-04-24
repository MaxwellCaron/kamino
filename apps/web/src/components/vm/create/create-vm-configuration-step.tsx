import { createVmFormOptions, withCreateVmForm } from "./create-vm-form"
import { IsoConfigurationFields } from "./create-vm-iso-configuration-fields"
import { TemplateConfigurationFields } from "./create-vm-template-configuration-fields"
import { UploadConfigurationFields } from "./create-vm-upload-configuration-fields"
import type { VmTemplateOption } from "./create-vm-form"
import type { NetworkData } from "./create-vm-step-shared"
import type { ApiISO, ApiNode, ApiStorage } from "@/lib/queries"

export const CreateVmConfigurationStep = withCreateVmForm({
  ...createVmFormOptions,
  props: {
    templateOptions: [] as Array<VmTemplateOption>,
    nodes: [] as Array<ApiNode>,
    diskStorages: [] as Array<ApiStorage>,
    isoStorages: [] as Array<ApiStorage>,
    isos: [] as Array<ApiISO>,
    networks: undefined as NetworkData | undefined,
  },
  render: function Render({
    form,
    templateOptions,
    nodes,
    diskStorages,
    isoStorages,
    isos,
    networks,
  }) {
    return (
      <form.Subscribe selector={(state) => state.values.method}>
        {(method) => {
          if (method === "template") {
            return (
              <TemplateConfigurationFields
                form={form}
                templateOptions={templateOptions}
                nodes={nodes}
              />
            )
          }

          if (method === "iso") {
            return (
              <IsoConfigurationFields
                form={form}
                nodes={nodes}
                diskStorages={diskStorages}
                isoStorages={isoStorages}
                isos={isos}
                networks={networks}
              />
            )
          }

          return <UploadConfigurationFields form={form} />
        }}
      </form.Subscribe>
    )
  },
})
