import { IconEdit, IconInfoCircle } from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useState } from "react"
import type { ApiTreeNode, ApiTreeNodeVM } from "@/lib/queries"
import { getVmCapabilities } from "@/lib/inventory-capabilities"
import { LoadingTransition } from "@/components/loading-transition"
import { VmNotesDialog } from "@/components/vm/vm-notes-dialog"

export function VmNotes({
  node,
  itemId,
  vm,
  isLoading,
}: {
  node: ApiTreeNode | null
  itemId: string
  vm: ApiTreeNodeVM | null
  isLoading: boolean
}) {
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const canEditNotes = getVmCapabilities(node?.permissions).notes.enabled
  const notes = vm?.notes?.trim() ? vm.notes : null

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconInfoCircle className="size-4 text-muted-foreground" />
          <span>Notes</span>
        </CardTitle>
        <CardAction>
          {vm && canEditNotes && (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={isLoading}
                onClick={() => setIsNotesOpen(true)}
              >
                <IconEdit className="size-4" />
              </Button>
              <VmNotesDialog
                itemId={itemId}
                vmName={node?.name ?? `VM ${vm.vmid}`}
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
        <LoadingTransition
          isLoading={isLoading}
          fallback={<Skeleton className="h-20 w-full rounded-md" />}
        >
          {!notes ? (
            <p className="text-sm text-muted-foreground">
              No notes saved for this VM.
            </p>
          ) : (
            <p className="text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground">
              {notes}
            </p>
          )}
        </LoadingTransition>
      </CardContent>
    </Card>
  )
}
