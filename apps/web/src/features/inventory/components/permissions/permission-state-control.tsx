import { HugeiconsIcon } from "@hugeicons/react"
import {
  Cancel01Icon,
  DivideSignIcon,
  Tick01Icon,
} from "@hugeicons/core-free-icons"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import type { PermissionState } from "../../types/inventory-types"

type PermissionStateControlProps = {
  onChange: (value: PermissionState) => void
  value: PermissionState
}

export function PermissionStateControl({
  onChange,
  value,
}: PermissionStateControlProps) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(nextValue) => {
        const state = nextValue[0]
        if (!state) return
        onChange(state as PermissionState)
      }}
      spacing={0}
      variant="outline"
    >
      <ToggleGroupItem
        value="deny"
        aria-label="Deny"
        className="text-destructive! transition-colors aria-pressed:bg-destructive/10!"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="inherit"
        aria-label="Inherit"
        className="transition-colors"
      >
        <HugeiconsIcon icon={DivideSignIcon} className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="allow"
        aria-label="Allow"
        className="text-emerald-600! transition-colors aria-pressed:bg-emerald-600/10! dark:text-emerald-400! dark:aria-pressed:bg-emerald-400/10!"
      >
        <HugeiconsIcon icon={Tick01Icon} className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
