import {
  IconBolt,
  IconCpu,
  IconDatabase,
  IconNetwork,
  IconSettings,
  IconTopologyBus,
} from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { DialogDescription, DialogTitle } from "@workspace/ui/components/dialog"
import {
  FieldDescription,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  createVmFormOptions,
  getSelectedTemplate,
  withCreateVmForm,
} from "./create-vm-form"
import { SummaryRow, SummarySection } from "./create-vm-step-shared"
import type { CreateVmFormValues, VmTemplateOption } from "./create-vm-form"
import type { InventoryFolderOption } from "@/features/inventory/utils/inventory-tree"
import { getSelectedFolder } from "@/features/inventory/utils/inventory-tree"

function getMachineTypeLabel(machine: string) {
  return machine === "pc" ? "i440fx" : machine
}

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

function IsoReview({
  values,
  selectedFolder,
}: {
  values: CreateVmFormValues
  selectedFolder: InventoryFolderOption | undefined
}) {
  return (
    <div className="flex flex-col gap-6">
      <FieldSet>
        <FieldLegend className="flex items-center gap-2">
          <IconSettings className="size-4" />
          General
        </FieldLegend>
        <FieldDescription>
          Confirm where the VM will run and how it will be identified.
        </FieldDescription>
        <div className="grid grid-cols-2 gap-6">
          <ReviewField label="Name" value={values.name || "Unset"} />
          <ReviewField label="Node" value={values.node || "Optimal"} />
          <ReviewField
            label="VMID"
            value={values.vmid > 0 ? values.vmid : "Auto"}
          />
          <ReviewField
            label="Destination Folder"
            value={selectedFolder?.label || "Unset"}
          />
        </div>
      </FieldSet>

      <FieldSeparator />

      <FieldSet>
        <FieldLegend className="flex items-center gap-2">
          <IconBolt className="size-4" />
          Operating System
        </FieldLegend>
        <FieldDescription>
          Review the guest OS type and install media selection.
        </FieldDescription>
        <div className="grid grid-cols-2 gap-6">
          <ReviewField label="OS Type" value={values.ostype} />
          <ReviewField label="BIOS" value={values.bios} />
          <ReviewField
            label="Machine Type"
            value={getMachineTypeLabel(values.machine)}
          />
          <ReviewField label="SCSI Controller" value={values.scsi || "Unset"} />
          <ReviewField
            label="ISO Storage"
            value={values.iso_storage || "Unset"}
          />
          <ReviewField label="ISO Image" value={values.iso || "Unset"} />
        </div>
      </FieldSet>

      <FieldSeparator />

      <FieldSet>
        <FieldLegend className="flex items-center gap-2">
          <IconCpu className="size-4" />
          Compute
        </FieldLegend>
        <FieldDescription>
          Review CPU, memory, and storage settings before creation.
        </FieldDescription>
        <div className="flex flex-col gap-4">
          <Item variant="muted">
            <ItemMedia>
              <IconCpu className="size-5" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="pl-1">CPU</ItemTitle>
              <ItemDescription className="px-1 not-italic">
                <div className="grid grid-cols-2 gap-6 text-sm text-foreground">
                  <ReviewField label="Sockets" value={values.sockets} />
                  <ReviewField label="Cores" value={values.cores} />
                  <ReviewField
                    label="CPU Type"
                    value={values.cpu_type}
                    className="col-span-2"
                  />
                </div>
              </ItemDescription>
            </ItemContent>
          </Item>

          <Item variant="muted">
            <ItemMedia>
              <IconTopologyBus className="size-5 rotate-180" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="pl-1">Memory</ItemTitle>
              <ItemDescription className="px-1 not-italic">
                <div className="grid grid-cols-2 gap-6 text-sm text-foreground">
                  <ReviewField label="Capacity" value={`${values.memory} GB`} />
                  <ReviewField label="Balloon" value={`${values.balloon} GB`} />
                </div>
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  Set balloon to "0" to disable
                </p>
              </ItemDescription>
            </ItemContent>
          </Item>

          <Item variant="muted">
            <ItemMedia>
              <IconDatabase className="size-5" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="pl-1">Storage</ItemTitle>
              <ItemDescription className="px-1 not-italic">
                <div className="grid grid-cols-2 gap-6 text-sm text-foreground">
                  <ReviewField label="Disk" value={values.storage || "Unset"} />
                  <ReviewField
                    label="Capacity"
                    value={`${values.disk_size} GB`}
                  />
                </div>
              </ItemDescription>
            </ItemContent>
          </Item>
        </div>
      </FieldSet>

      <FieldSeparator />

      <FieldSet>
        <FieldLegend className="flex items-center gap-2">
          <IconNetwork className="size-4" />
          Network
        </FieldLegend>
        <FieldDescription>
          Review each interface attachment and network settings.
        </FieldDescription>
        <div className="flex flex-col gap-4">
          {values.networks.map((network, index) => (
            <div
              key={`${network.bridge}-${index}`}
              className="flex flex-col gap-4 rounded-2xl border p-4"
            >
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{`net${index}`}</p>
                <p className="text-xs text-muted-foreground">
                  Connectivity settings for this interface.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <ReviewField
                  label="Bridge / VNet"
                  value={network.bridge || "Unset"}
                />
                <ReviewField label="Model" value={network.model} />
                <ReviewField
                  label="VLAN Tag"
                  value={network.vlan_tag ?? "Optional"}
                />
                <ReviewField
                  label="Firewall"
                  value={network.firewall ? "Enabled" : "Disabled"}
                />
              </div>
            </div>
          ))}
        </div>
      </FieldSet>
    </div>
  )
}

function ReviewField({
  label,
  value,
  className,
}: {
  label: string
  value: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-1 text-sm text-muted-foreground">{label}</div>
      <div className="wrap-break-words text-sm font-medium">{value}</div>
    </div>
  )
}
