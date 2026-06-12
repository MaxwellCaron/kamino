import { useMemo } from "react"
import { IconPlus } from "@tabler/icons-react"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@workspace/ui/components/combobox"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Button } from "@workspace/ui/components/button"
import { principalTypeLabels } from "../../utils/constants"
import type { PrincipalOption } from "../../types/inventory-types"

type AddPrincipalsDialogProps = {
  availablePrincipalIds: Array<string>
  disabled?: boolean
  onAdd: (selectedIds: Array<string>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  principalMap: Map<string, PrincipalOption>
}

export function AddPrincipalsDialog({
  availablePrincipalIds,
  disabled,
  onAdd,
  open,
  onOpenChange,
  principalMap,
}: AddPrincipalsDialogProps) {
  const availablePrincipals = useMemo(() => {
    return availablePrincipalIds
      .map((id) => principalMap.get(id))
      .filter((p): p is PrincipalOption => !!p)
  }, [availablePrincipalIds, principalMap])

  const handleValueChange = (principal: PrincipalOption | null) => {
    if (principal) {
      onAdd([principal.id])
      onOpenChange(false)
    }
  }

  return (
    <Combobox
      open={open}
      onOpenChange={onOpenChange}
      items={availablePrincipals}
      itemToStringLabel={(p: PrincipalOption | null) => p?.label ?? ""}
      onValueChange={handleValueChange}
    >
      <ComboboxTrigger
        disabled={disabled}
        render={<Button size="icon" disabled={disabled} />}
        className="[&>svg:last-child]:hidden"
      >
        <IconPlus />
      </ComboboxTrigger>
      <ComboboxContent align="end" className="w-80">
        <ComboboxInput showTrigger={false} placeholder="Search principals..." />
        <ComboboxEmpty>No principals found.</ComboboxEmpty>
        <ComboboxList>
          {(principal) => (
            <ComboboxItem key={principal.id} value={principal}>
              <Item size="xs" className="p-0">
                <ItemContent>
                  <ItemTitle className="whitespace-nowrap">
                    {principal.label}
                  </ItemTitle>
                  <ItemDescription>
                    {
                      principalTypeLabels[
                        principal.type as keyof typeof principalTypeLabels
                      ]
                    }
                  </ItemDescription>
                </ItemContent>
              </Item>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
