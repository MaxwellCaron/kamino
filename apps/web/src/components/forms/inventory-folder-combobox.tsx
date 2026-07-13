import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import type { InventoryFolderOption } from "@/features/inventory/utils/inventory-tree"
import { getSelectedFolder } from "@/features/inventory/utils/inventory-tree"

export function InventoryFolderCombobox({
  folderOptions,
  selectedFolderId,
  onSelectedFolderChange,
  onBlur,
  id,
  invalid,
  disabled,
  placeholder = "Select a folder",
}: {
  folderOptions: Array<InventoryFolderOption>
  selectedFolderId: string | null
  onSelectedFolderChange: (folderId: string | null) => void
  onBlur?: () => void
  id?: string
  invalid?: boolean
  disabled?: boolean
  placeholder?: string
}) {
  return (
    <Combobox
      items={folderOptions}
      itemToStringValue={(folder) => folder.label}
      value={getSelectedFolder(folderOptions, selectedFolderId ?? "") ?? null}
      onValueChange={(folder) => onSelectedFolderChange(folder?.id ?? null)}
      autoHighlight
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
      />
      <ComboboxEmpty>No folders found.</ComboboxEmpty>
      <ComboboxContent>
        <ComboboxList>
          {(folder) => (
            <ComboboxItem key={folder.id} value={folder}>
              {folder.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
