import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import type { NetworkOption } from "@/features/vms/components/hardware/hardware-section-utils"

type NetworkOptionGroup = {
  key: string
  label: string
  items: Array<NetworkOption>
}

type VmHardwareNetworkBridgeComboboxProps = {
  bridgeOptions: Array<NetworkOption>
  vnetOptions: Array<NetworkOption>
  networkOptions: Array<NetworkOption>
  value: string
  id?: string
  errorId?: string
  invalid?: boolean
  disabled?: boolean
  onBlur: () => void
  onValueChange: (value: string) => void
}

function buildNetworkGroups(
  bridgeOptions: Array<NetworkOption>,
  vnetOptions: Array<NetworkOption>
): Array<NetworkOptionGroup> {
  const groups: Array<NetworkOptionGroup> = []

  if (bridgeOptions.length) {
    groups.push({ key: "bridges", label: "Bridges", items: bridgeOptions })
  }

  if (vnetOptions.length) {
    groups.push({ key: "vnets", label: "VNets", items: vnetOptions })
  }

  return groups
}

export function VmHardwareNetworkBridgeCombobox({
  bridgeOptions,
  vnetOptions,
  networkOptions,
  value,
  id,
  errorId,
  invalid,
  disabled,
  onBlur,
  onValueChange,
}: VmHardwareNetworkBridgeComboboxProps) {
  const networkGroups = buildNetworkGroups(bridgeOptions, vnetOptions)

  return (
    <Combobox
      items={networkGroups}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      value={networkOptions.find((option) => option.value === value) ?? null}
      onValueChange={(option) => onValueChange(option?.value ?? "")}
      disabled={disabled}
      autoHighlight
    >
      <ComboboxInput
        id={id}
        placeholder="Select network"
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        aria-errormessage={invalid ? errorId : undefined}
      />
      <ComboboxContent>
        <ComboboxEmpty>No networks found.</ComboboxEmpty>
        <ComboboxList>
          {(group) => (
            <ComboboxGroup key={group.key} items={group.items}>
              <ComboboxLabel>{group.label}</ComboboxLabel>
              <ComboboxCollection>
                {(option) => (
                  <ComboboxItem key={option.value} value={option}>
                    {option.label}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
