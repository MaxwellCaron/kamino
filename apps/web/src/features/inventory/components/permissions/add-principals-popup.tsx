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
  itemName: string
  onAdd: (selectedIds: Array<string>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  principalMap: Map<string, PrincipalOption>
}

export function AddPrincipalsDialog(props: AddPrincipalsDialogProps) {
  const availablePrincipals = useMemo(() => {
    return props.availablePrincipalIds
      .map((id) => props.principalMap.get(id))
      .filter((p): p is PrincipalOption => !!p)
  }, [props.availablePrincipalIds, props.principalMap])

  const handleValueChange = (principal: PrincipalOption | null) => {
    if (principal) {
      props.onAdd([principal.id])
      props.onOpenChange(false)
    }
  }

  return (
    <Combobox
      open={props.open}
      onOpenChange={props.onOpenChange}
      items={availablePrincipals}
      itemToStringLabel={(p: PrincipalOption | null) => p?.label ?? ""}
      onValueChange={handleValueChange}
    >
      <ComboboxTrigger
        disabled={props.disabled}
        render={<Button size="icon" disabled={props.disabled} />}
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
