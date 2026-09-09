import { ComboboxItem } from "@workspace/ui/components/combobox"
import type { PrincipalOption } from "@/features/inventory/types/inventory-types"

export function PublishPodPrincipalOption({
  principal,
}: {
  principal: PrincipalOption
}) {
  return (
    <ComboboxItem value={principal}>
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{principal.label}</span>
        <span className="text-xs text-muted-foreground">
          {principal.type === "group" ? "Group" : "User"}
        </span>
      </div>
    </ComboboxItem>
  )
}
