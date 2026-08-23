import { HugeiconsIcon } from "@hugeicons/react"
import {
  InformationCircleIcon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { useState } from "react"
import type {
  ApiTreeNode,
  ApiTreeNodeVM,
} from "@/features/inventory/types/inventory-types"
import { getVmCapabilities } from "@/features/inventory/utils/inventory-capabilities"
import { VmNotesDialog } from "@/features/vms/components/dashboard/vm-notes-dialog"

export function VmNotes({
  node,
  itemId,
  vm,
}: {
  node: ApiTreeNode
  itemId: string
  vm: ApiTreeNodeVM
}) {
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const canEditNotes = getVmCapabilities(node.permissions).notes.enabled
  const notes = vm.notes?.trim() ? vm.notes : null

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={InformationCircleIcon}
            className="size-5 text-muted-foreground"
          />
          <span>Notes</span>
        </CardTitle>
        <CardAction>
          {canEditNotes && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="-mt-1"
                aria-label="Edit VM notes"
                onClick={() => setIsNotesOpen(true)}
              >
                <HugeiconsIcon icon={PencilEdit01Icon} />
              </Button>
              <VmNotesDialog
                itemId={itemId}
                vmName={node.name}
                vmid={vm.vmid}
                initialNotes={vm.notes}
                open={isNotesOpen}
                onOpenChange={setIsNotesOpen}
              />
            </>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="mx-4 -mt-4 h-full rounded-4xl bg-muted/50 py-4">
        {!notes ? (
          <p className="text-sm text-muted-foreground">
            No notes saved for this VM.
          </p>
        ) : (
          <p className="text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground">
            {notes}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
