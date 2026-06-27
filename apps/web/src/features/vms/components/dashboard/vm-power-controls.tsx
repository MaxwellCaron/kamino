import { HugeiconsIcon } from "@hugeicons/react"
import { PowerIcon } from "@hugeicons/core-free-icons"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { ApiTreeNode } from "@/features/inventory/types/inventory-types"
import type { VmPowerActionItem } from "@/features/vms/hooks/use-vm-power-actions"
import { useInventoryDialogs } from "@/features/inventory/components/inventory-dialogs-provider"
import { useVmPowerActions } from "@/features/vms/hooks/use-vm-power-actions"

interface VmPowerControlsProps {
  node: ApiTreeNode
  itemId: string
  vm: { vmid: number; name?: string }
  powerStatus?: string
  isTemplate?: boolean
}

export function VmPowerControls({
  node,
  itemId,
  vm,
  powerStatus,
  isTemplate,
}: VmPowerControlsProps) {
  const { openConfirm } = useInventoryDialogs()
  const powerActions = useVmPowerActions({
    itemId,
    permissions: node.permissions,
    powerStatus,
    vmid: vm.vmid,
    vmName: node.name,
  })

  if (isTemplate) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={PowerIcon}
            className="size-4 text-muted-foreground"
          />
          Power Options
        </CardTitle>
      </CardHeader>
      <CardContent className="h-full">
        <div className="grid h-full grid-cols-2 grid-rows-2 gap-4 [&_button]:h-full [&_button]:min-h-14">
          {powerActions.actions.map((action: VmPowerActionItem) => {
            return (
              <Button
                key={action.action}
                variant={action.label === "Stop" ? "destructive" : "outline"}
                onClick={() =>
                  powerActions.openPowerAction(action.action, openConfirm)
                }
                disabled={action.disabled}
              >
                <HugeiconsIcon icon={action.icon} data-icon="inline-start" />
                <span className="inline md:hidden 2xl:inline">
                  {action.label}
                </span>
              </Button>
            )
          })}
        </div>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">
          {powerActions.cardDescription}
        </p>
      </CardFooter>
    </Card>
  )
}
