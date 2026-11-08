import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@workspace/ui/components/attachment"
import { AppDialogScrollBody } from "@/components/dialogs/app-dialog"
import type { InventoryDeleteItem } from "@/lib/inventory/actions/inventory-delete-items"

export function InventoryDeleteConfirmItems({
  items,
}: {
  items: Array<InventoryDeleteItem>
}) {
  return (
    <AppDialogScrollBody className="-mb-8 gap-3">
      {items.map((item) => (
        <Attachment key={item.id} className="w-full">
          <AttachmentMedia>{item.icon}</AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{item.name}</AttachmentTitle>
          </AttachmentContent>
        </Attachment>
      ))}
    </AppDialogScrollBody>
  )
}
