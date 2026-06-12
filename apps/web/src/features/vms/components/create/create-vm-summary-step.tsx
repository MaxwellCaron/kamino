import { Badge } from "@workspace/ui/components/badge"
import { DialogDescription, DialogTitle } from "@workspace/ui/components/dialog"
import {
  createVmFormOptions,
  getSelectedTemplate,
  withCreateVmForm,
} from "./create-vm-form"
import { SummaryRow, SummarySection } from "./create-vm-step-shared"
import { IsoReview } from "./create-vm-summary-review"
import type { VmTemplateOption } from "./create-vm-form"
import type { InventoryFolderOption } from "@/features/inventory/utils/inventory-tree"
import { getSelectedFolder } from "@/features/inventory/utils/inventory-tree"

export const CreateVmSummaryStep = withCreateVmForm({
  ...createVmFormOptions,
  props: {
    folderOptions: [] as Array<InventoryFolderOption>,
    templateOptions: [] as Array<VmTemplateOption>,
  },
  render: function Render({ form, folderOptions, templateOptions }) {
    return (
      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const selectedTemplate = getSelectedTemplate(
            templateOptions,
            values.template_id ?? ""
          )
          const selectedFolder = getSelectedFolder(
            folderOptions,
            values.target_folder_id
          )
          const templateCloneName =
            values.name || selectedTemplate?.name || "Unset"

          return (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3 rounded-2xl border bg-muted/20 p-4">
                <div className="flex flex-col gap-1">
                  <DialogTitle>Review Configuration</DialogTitle>
                  <DialogDescription>
                    Confirm the selected creation path and the values Kamino
                    will use.
                  </DialogDescription>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {values.method}
                </Badge>
              </div>

              {values.method === "template" ? (
                <SummarySection title="Template Clone">
                  <SummaryRow
                    label="Source"
                    value={
                      selectedTemplate
                        ? `${selectedTemplate.name} (${selectedTemplate.node}/${selectedTemplate.vmid})`
                        : "No template selected"
                    }
                  />
                  <SummaryRow
                    label="New VM ID"
                    value={values.vmid > 0 ? values.vmid : "Auto"}
                  />
                  <SummaryRow label="Node" value={values.node || "Optimal"} />
                  <SummaryRow label="Name" value={templateCloneName} />
                  <SummaryRow
                    label="Destination Folder"
                    value={selectedFolder?.label || "Unset"}
                  />
                  <SummaryRow
                    label="Clone Mode"
                    value={values.full_clone ? "Full clone" : "Linked clone"}
                  />
                </SummarySection>
              ) : null}

              {values.method === "iso" ? (
                <IsoReview values={values} selectedFolder={selectedFolder} />
              ) : null}

              {values.method === "upload" ? (
                <SummarySection title="Upload Workflow">
                  <SummaryRow label="Status" value="Not implemented yet" />
                  <SummaryRow
                    label="Target File"
                    value={values.upload_filename?.trim() || "No ISO selected"}
                  />
                  <SummaryRow
                    label="Notes"
                    value={values.upload_notes?.trim() || "No notes provided"}
                  />
                </SummarySection>
              ) : null}
            </div>
          )
        }}
      </form.Subscribe>
    )
  },
})
