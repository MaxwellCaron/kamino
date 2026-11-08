import {
  createVmFormOptions,
  withCreateVmForm,
} from "@/hooks/vms/use-create-vm-form"

export const UploadConfigurationFields = withCreateVmForm({
  ...createVmFormOptions,
  render: function Render() {
    return <div className="flex flex-col gap-6">WIP</div>
  },
})
