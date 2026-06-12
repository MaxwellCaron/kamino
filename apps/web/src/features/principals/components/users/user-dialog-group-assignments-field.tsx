import * as React from "react"
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
import { Field, FieldContent, FieldLabel } from "@workspace/ui/components/field"

export function UserDialogGroupAssignmentsField({
  id,
  groupItems,
  groupOptionMap,
  selectedGroupIds,
  setSelectedGroupIds,
}: {
  id: string
  groupItems: Array<string>
  groupOptionMap: Map<string, string>
  selectedGroupIds: Array<string>
  setSelectedGroupIds: React.Dispatch<React.SetStateAction<Array<string>>>
}) {
  const anchor = useComboboxAnchor()

  return (
    <Field>
      <FieldLabel htmlFor={id}>Groups</FieldLabel>
      <FieldContent>
        <Combobox
          multiple
          autoHighlight
          items={groupItems}
          value={selectedGroupIds}
          onValueChange={(value) =>
            setSelectedGroupIds(Array.from(new Set(value)))
          }
        >
          <ComboboxChips ref={anchor} className="w-full">
            <ComboboxValue>
              {(values) => (
                <React.Fragment>
                  {(values as Array<string>).map((groupID) => (
                    <ComboboxChip key={groupID}>
                      {groupOptionMap.get(groupID) ?? groupID}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput id={id} placeholder="Assign groups..." />
                </React.Fragment>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No groups found.</ComboboxEmpty>
            <ComboboxList>
              {(groupID) => (
                <ComboboxItem key={groupID as string} value={groupID as string}>
                  {groupOptionMap.get(groupID as string) ?? (groupID as string)}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </FieldContent>
    </Field>
  )
}
