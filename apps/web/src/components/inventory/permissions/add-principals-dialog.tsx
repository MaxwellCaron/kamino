import React from "react"
import { IconPlus } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field } from "@workspace/ui/components/field"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  nestedDialogAnimationClassName,
  principalTypeLabels,
} from "./constants"
import type { PrincipalOption } from "./types"

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
  const addAnchor = useComboboxAnchor()
  const [selectedIds, setSelectedIds] = React.useState<Array<string>>([])

  React.useEffect(() => {
    if (!open) {
      setSelectedIds([])
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={<Button variant="secondary" disabled={disabled} />}
      >
        <IconPlus />
        Add Principals
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        showOverlay={false}
        className={nestedDialogAnimationClassName}
      >
        <DialogHeader>
          <DialogTitle>Add Principals</DialogTitle>
          <DialogDescription>
            Select one or more users or groups to configure permissions for this
            item.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <Combobox
            multiple
            items={availablePrincipalIds}
            value={selectedIds}
            onValueChange={(value) => setSelectedIds(value)}
          >
            <ComboboxChips ref={addAnchor} className="w-full">
              <ComboboxValue>
                {(values: Array<string>) => (
                  <React.Fragment>
                    {values.map((principalId) => {
                      const principal = principalMap.get(principalId)

                      return (
                        <ComboboxChip key={principalId}>
                          {principal?.label}
                        </ComboboxChip>
                      )
                    })}
                    <ComboboxChipsInput placeholder="Search principals..." />
                  </React.Fragment>
                )}
              </ComboboxValue>
            </ComboboxChips>
            <ComboboxContent anchor={addAnchor}>
              <ComboboxEmpty>No principals found.</ComboboxEmpty>
              <ComboboxList>
                {(principalId) => {
                  const principal = principalMap.get(principalId as string)
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
          <DialogClose render={<Button variant="outline">Close</Button>} />
          <Button
            onClick={() => onAdd(selectedIds)}
            disabled={selectedIds.length === 0}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
