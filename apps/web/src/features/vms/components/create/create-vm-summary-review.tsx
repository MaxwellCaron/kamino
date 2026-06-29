import { HugeiconsIcon } from "@hugeicons/react"
import {
  BoltIcon,
  CpuIcon,
  Globe02Icon,
  HardDriveIcon,
  RamMemoryIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons"
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
import type { ReactNode } from "react"
import type { CreateVmFormValues } from "./create-vm-form"
import type { InventoryFolderOption } from "@/features/inventory/utils/inventory-tree"

function getMachineTypeLabel(machine: string) {
  return machine === "pc" ? "i440fx" : machine
}

function ReviewField({
  label,
  value,
  className,
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <div className="mb-1 text-sm text-muted-foreground">{label}</div>
      <div className="wrap-break-words text-sm font-medium">{value}</div>
    </div>
  )
}

export function IsoReview({
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
          <HugeiconsIcon icon={Settings01Icon} className="size-4" />
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
          <HugeiconsIcon icon={BoltIcon} className="size-4" />
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
          <HugeiconsIcon icon={CpuIcon} className="size-4" />
          Compute
        </FieldLegend>
        <FieldDescription>
          Review CPU, memory, and storage settings before creation.
        </FieldDescription>
        <div className="flex flex-col gap-4">
          <Item variant="muted">
            <ItemMedia>
              <HugeiconsIcon icon={CpuIcon} className="size-5" />
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
              <HugeiconsIcon icon={RamMemoryIcon} className="size-5" />
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
              <HugeiconsIcon icon={HardDriveIcon} className="size-5" />
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
          <HugeiconsIcon icon={Globe02Icon} className="size-4" />
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
