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
  ComboboxSeparator,
} from "@workspace/ui/components/combobox"
import type { NetworkOption } from "@/features/vms/components/hardware/hardware-section-utils"

type VmHardwareNetworkBridgeComboboxProps = {
  bridgeOptions: Array<NetworkOption>
  vnetOptions: Array<NetworkOption>
  networkOptions: Array<NetworkOption>
  value: string
  invalid?: boolean
  onBlur: () => void
  onValueChange: (value: string) => void
}

export function VmHardwareNetworkBridgeCombobox({
  bridgeOptions,
  vnetOptions,
  networkOptions,
  value,
  invalid,
  onBlur,
  onValueChange,
}: VmHardwareNetworkBridgeComboboxProps) {
  return (
    <Combobox
      items={networkOptions}
      itemToStringValue={(option) => option.label}
      value={networkOptions.find((option) => option.value === value) ?? null}
      onValueChange={(option) => onValueChange(option?.value ?? "")}
      autoHighlight
    >
      <ComboboxInput
        placeholder="Select network"
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
      />
      <ComboboxContent>
        <ComboboxEmpty>No networks found.</ComboboxEmpty>
        <ComboboxList>
          {bridgeOptions.length ? (
            <ComboboxGroup items={bridgeOptions}>
              <ComboboxLabel>Bridges</ComboboxLabel>
              <ComboboxCollection>
                {(option) => (
                  <ComboboxItem key={option.value} value={option}>
                    {option.label}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          ) : null}
          {bridgeOptions.length && vnetOptions.length ? (
            <ComboboxSeparator />
          ) : null}
          {vnetOptions.length ? (
            <ComboboxGroup items={vnetOptions}>
              <ComboboxLabel>VNets</ComboboxLabel>
              <ComboboxCollection>
                {(option) => (
                  <ComboboxItem key={option.value} value={option}>
                    {option.label}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          ) : null}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
