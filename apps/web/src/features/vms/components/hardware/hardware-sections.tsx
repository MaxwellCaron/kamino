import {
  IconCpu,
  IconDatabase,
  IconNetwork,
  IconSettings,
  IconTopologyBus,
} from "@tabler/icons-react"
import {
  FieldDescription,
  FieldGroup,
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

export function VmHardwareOperatingSystemSection({
  legendIcon,
  title = "Operating System",
  description,
  leadingFields,
  osTypeField,
  biosField,
  machineField,
  scsiField,
}: {
  legendIcon?: ReactNode
  title?: string
  description: string
  leadingFields?: ReactNode
  osTypeField: ReactNode
  biosField: ReactNode
  machineField: ReactNode
  scsiField: ReactNode
}) {
  return (
    <FieldSet>
      <FieldLegend className="flex items-center gap-2">
        {legendIcon ?? <IconSettings className="size-4" />}
        {title}
      </FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      <FieldGroup>
        {leadingFields}
        {osTypeField}
        <div className="grid grid-cols-2 gap-6">
          {biosField}
          {machineField}
        </div>
        {scsiField}
      </FieldGroup>
    </FieldSet>
  )
}

export function VmHardwareComputeSection({
  description,
  socketsField,
  coresField,
  cpuTypeField,
  memoryField,
  balloonField,
  balloonDescription,
}: {
  description: string
  socketsField: ReactNode
  coresField: ReactNode
  cpuTypeField: ReactNode
  memoryField: ReactNode
  balloonField: ReactNode
  balloonDescription?: string
}) {
  return (
    <>
      <FieldSeparator />
      <FieldSet>
        <FieldLegend className="flex items-center gap-2">
          <IconCpu className="size-4" />
          Compute
        </FieldLegend>
        <FieldDescription>{description}</FieldDescription>
        <FieldGroup>
          <Item variant="muted">
            <ItemMedia>
              <IconCpu className="size-5" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="pl-1">CPU</ItemTitle>
              <ItemDescription className="px-1">
                Adjust socket, core, and CPU model settings.
              </ItemDescription>
              <div className="space-y-6 px-1 pt-4">
                <div className="grid grid-cols-2 gap-6">
                  {socketsField}
                  {coresField}
                </div>
                {cpuTypeField}
              </div>
            </ItemContent>
          </Item>

          <Item variant="muted">
            <ItemMedia>
              <IconTopologyBus className="size-5 rotate-180" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle className="pl-1">Memory</ItemTitle>
              <ItemDescription className="px-1">
                Configure assigned memory and ballooning behavior.
              </ItemDescription>
              <div className="space-y-4 px-1 pt-4">
                <div className="grid grid-cols-2 gap-6">
                  {memoryField}
                  {balloonField}
                </div>
                {balloonDescription ? (
                  <div className="text-center text-muted-foreground">
                    {balloonDescription}
                  </div>
                ) : null}
              </div>
            </ItemContent>
          </Item>
        </FieldGroup>
      </FieldSet>
    </>
  )
}

export function VmHardwareStorageSection({
  storageField,
  diskSizeField,
}: {
  storageField: ReactNode
  diskSizeField: ReactNode
}) {
  return (
    <Item variant="muted">
      <ItemMedia>
        <IconDatabase className="size-5" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="pl-1">Storage</ItemTitle>
        <ItemDescription className="px-1">
          Review the primary disk target and size.
        </ItemDescription>
        <div className="space-y-4 px-1 pt-4">
          {storageField}
          {diskSizeField}
        </div>
      </ItemContent>
    </Item>
  )
}

export function VmHardwareNetworkSection({
  children,
}: {
  children: ReactNode
}) {
  return (
    <>
      <FieldSeparator />
      <FieldSet>
        <FieldLegend className="flex items-center gap-2">
          <IconNetwork className="size-4" />
          Network
        </FieldLegend>
        <FieldDescription>
          Attach one or more interfaces to a Proxmox bridge or SDN VNet.
        </FieldDescription>
        {children}
      </FieldSet>
    </>
  )
}

export function VmHardwareNetworkCard({
  title,
  description,
  removeAction,
  children,
}: {
  title: string
  description: string
  removeAction?: ReactNode
  children: ReactNode
}) {
  return (
    <Item variant="muted" className="items-start">
      <ItemContent className="gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <ItemTitle className="pl-1">{title}</ItemTitle>
            <ItemDescription className="px-1">{description}</ItemDescription>
          </div>
          {removeAction}
        </div>
        {children}
      </ItemContent>
    </Item>
  )
}
