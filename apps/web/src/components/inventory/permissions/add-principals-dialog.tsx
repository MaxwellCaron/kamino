import React from "react"
import { IconPlus } from "@tabler/icons-react"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import {
  Dialog,
  DialogFooter,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field } from "@workspace/ui/components/field"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import { Button } from "@workspace/ui/components/button"
import {
  nestedDialogAnimationClassName,
  principalTypeLabels,
} from "./constants"
import type { PrincipalOption } from "./types"
import {
  AppDialogContent,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"

type AddPrincipalsDialogProps = {
  availablePrincipalIds: Array<string>
  disabled?: boolean
  itemName: string
  onAdd: (selectedIds: Array<string>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  principalMap: Map<string, PrincipalOption>
}

function AddPrincipalsContent({
  availablePrincipalIds,
  onAdd,
  principalMap,
}: Omit<AddPrincipalsDialogProps, "open" | "onOpenChange">) {
  const addAnchor = useComboboxAnchor()
  const [selectedIds, setSelectedIds] = React.useState<Array<string>>([])

  return (
    <React.Fragment>
      <Field>
        <Combobox
          multiple
          items={availablePrincipalIds}
          itemToStringLabel={(id) => principalMap.get(id)?.label ?? id}
          value={selectedIds}
          onValueChange={setSelectedIds}
        >
          <ComboboxChips ref={addAnchor} className="w-full">
            <ComboboxValue>
              {(values: Array<string>) => (
                <React.Fragment>
                  {values.map((id) => (
                    <ComboboxChip key={id}>
                      {principalMap.get(id)?.label}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput placeholder="Search principals..." />
                </React.Fragment>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={addAnchor}>
            <ComboboxEmpty>No principals found.</ComboboxEmpty>
            <ComboboxList>
              {(id) => {
                const principal = principalMap.get(id as string)
                if (!principal) return null
                return (
                  <ComboboxItem key={principal.id} value={principal.id}>
                    <Item size="xs" className="p-0">
                      <ItemContent>
                        <ItemTitle className="whitespace-nowrap">
                          {principal.label}
                        </ItemTitle>
                        <ItemDescription>
                          {principalTypeLabels[principal.type]}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  </ComboboxItem>
                )
              }}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </Field>
      <DialogFooter>
        <AppDialogPrimaryButton
          onClick={() => onAdd(selectedIds)}
          disabled={selectedIds.length === 0}
        >
          Add
        </AppDialogPrimaryButton>
      </DialogFooter>
    </React.Fragment>
  )
}

export function AddPrincipalsDialog(props: AddPrincipalsDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger render={<Button size="icon" disabled={props.disabled} />}>
        <IconPlus />
      </DialogTrigger>
      <AppDialogContent
        icon={IconPlus}
        title="Add Principals"
        description={`Select users or groups to configure permissions for ${props.itemName}.`}
        showOverlay={false}
        className={nestedDialogAnimationClassName}
      >
        {props.open && <AddPrincipalsContent {...props} />}
      </AppDialogContent>
    </Dialog>
  )
}
