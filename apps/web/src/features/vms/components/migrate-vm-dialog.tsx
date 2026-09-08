import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowDataTransferHorizontalIcon } from "@hugeicons/core-free-icons"
import { DialogFooter } from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import type { MigrateVmDialogItem } from "@/features/inventory/components/inventory-dialogs-context"
import {
  AppDialog,
  AppDialogPrimaryButton,
} from "@/components/dialogs/app-dialog"
import { InlineErrorAlert } from "@/components/feedback/inline-error-alert"
import { showUnitMutationToast } from "@/components/feedback/mutation-progress-toast"
import { PreloadOverlay } from "@/components/loading-overlay"
import { formatVmReference } from "@/features/shared/utils/format"
import { nodesQueryOptions } from "@/features/vms/api/proxmox-options-api"
import { useMigrateVMs } from "@/features/vms/hooks/use-vm-actions"

export function MigrateVmDialog({
  items,
  onSettled,
  open,
  onOpenChange,
}: {
  items: Array<MigrateVmDialogItem>
  onSettled?: (failedItemIds: Array<string>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [targetNode, setTargetNode] = useState("")
  const migrate = useMigrateVMs()
  const {
    data: nodes = [],
    error,
    isLoading,
  } = useQuery({
    ...nodesQueryOptions,
    enabled: open,
  })
  const sourceNodes = new Set(items.map((item) => item.node))
  const availableNodes = nodes.filter(
    (node) => node.status === "online" && !sourceNodes.has(node.node)
  )
  const isBulk = items.length > 1
  const selectionLabel = isBulk
    ? `${items.length} selected VMs`
    : formatVmReference(items[0]?.vmid, items[0]?.name)

  function submitMigration() {
    if (!targetNode) return

    const destination = targetNode
    onOpenChange(false)
    showUnitMutationToast({
      title: `Migrating ${selectionLabel}`,
      units: [
        {
          items: items.map((item) => ({
            id: item.id,
            name: formatVmReference(item.vmid, item.name),
            successDescription: `Migrated to ${destination}`,
          })),
          run: async () => {
            const result = await migrate.mutateAsync({
              itemIds: items.map((item) => item.id),
              target: destination,
            })
            return { failed: result.failed }
          },
        },
      ],
      onSettled: (result) =>
        onSettled?.(result.failed.map((failure) => failure.id)),
    })
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      onClosed={() => setTargetNode("")}
      icon={ArrowDataTransferHorizontalIcon}
      title="Migrate"
      description={`Move ${selectionLabel} to another Proxmox node.`}
    >
      <div className="relative min-h-32">
        <PreloadOverlay active={isLoading} label="Loading destination nodes" />
        {error ? (
          <InlineErrorAlert
            error={error}
            fallback="Failed to load destination nodes."
          />
        ) : !isLoading ? (
          <form action={submitMigration}>
            <FieldGroup>
              <Field
                data-disabled={availableNodes.length === 0 ? true : undefined}
              >
                <FieldLabel htmlFor="migration-target-node">
                  Destination node
                </FieldLabel>
                <Select
                  value={targetNode}
                  onValueChange={(value) => setTargetNode(value ?? "")}
                  disabled={availableNodes.length === 0}
                >
                  <SelectTrigger id="migration-target-node" className="w-full">
                    <SelectValue placeholder="Select a node" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Nodes</SelectLabel>
                      {availableNodes.map((node) => (
                        <SelectItem key={node.node} value={node.node}>
                          {node.node}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {availableNodes.length === 0 ? (
                  <FieldDescription>
                    No online destination nodes are available for this
                    selection.
                  </FieldDescription>
                ) : null}
              </Field>
            </FieldGroup>

            <DialogFooter>
              <AppDialogPrimaryButton
                disabled={!targetNode}
                pending={migrate.isPending}
              >
                Migrate
              </AppDialogPrimaryButton>
            </DialogFooter>
          </form>
        ) : null}
      </div>
    </AppDialog>
  )
}
