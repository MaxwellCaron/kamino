import { ComboboxItem } from "@workspace/ui/components/combobox"
import {
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import { VmIcon } from "@/components/status/vm-icon"

type VmTemplateOption = {
  id: string
  name: string
  node: string
  vmid: number
}

export function VmTemplateComboboxItem({
  template,
}: {
  template: VmTemplateOption
}) {
  return (
    <ComboboxItem value={template}>
      <ItemMedia variant="icon">
        <VmIcon isTemplate status={undefined} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{template.name}</ItemTitle>
        <ItemDescription>
          {template.node}/{template.vmid}
        </ItemDescription>
      </ItemContent>
    </ComboboxItem>
  )
}
