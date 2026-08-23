import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import type { PodCloneTarget } from "@/features/pods/api/clone-targets-api"

export type PodCloneTargetComboboxProps = {
  disabled?: boolean
  emptyMessage?: string
  id: string
  invalid?: boolean
  name?: string
  onBlur?: () => void
  onValueChange: (targetKey: string) => void
  placeholder?: string
  targets: Array<PodCloneTarget>
  value: string
}

export function PodCloneTargetCombobox({
  disabled,
  emptyMessage = "No compatible clone targets found.",
  id,
  invalid,
  name,
  onBlur,
  onValueChange,
  placeholder = "Select clone target",
  targets,
  value,
}: PodCloneTargetComboboxProps) {
  const selectedTarget = targets.find((target) => target.key === value) ?? null

  return (
    <Combobox
      items={targets}
      itemToStringLabel={(target) => target.label}
      itemToStringValue={(target) => target.label}
      value={selectedTarget}
      onValueChange={(target) => onValueChange(target?.key ?? "")}
      disabled={disabled}
      autoHighlight
    >
      <ComboboxInput
        id={id}
        name={name}
        placeholder={placeholder}
        onBlur={onBlur}
        disabled={disabled}
        aria-invalid={invalid || undefined}
      />
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(target) => (
            <ComboboxItem key={target.key} value={target}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{target.label}</span>
                <span className="text-xs text-muted-foreground">
                  {target.dmz_vnet
                    ? `${target.lan_vnet} / ${target.dmz_vnet}`
                    : target.lan_vnet}
                  {` · ${target.wan_bridge} · ${target.wan_subnet}`}
                </span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
