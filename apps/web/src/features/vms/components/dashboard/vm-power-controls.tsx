import { IconPower } from "@tabler/icons-react"
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
  node: ApiTreeNode | null
  itemId: string
  vm: { vmid: number; name?: string } | null
  powerStatus?: string
  isTemplate?: boolean
  isLoading?: boolean
}

export function VmPowerControls({
  node,
  itemId,
  vm,
  powerStatus,
  isTemplate,
  isLoading: isGlobalLoading,
}: VmPowerControlsProps) {
  const { openConfirm } = useInventoryDialogs()
  const powerActions = useVmPowerActions({
    itemId,
    permissions: node?.permissions,
    powerStatus,
    vmid: vm?.vmid,
    vmName: node?.name,
    isLoading: isGlobalLoading,
  })

  if (!node || !vm || isTemplate) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconPower className="size-4 text-muted-foreground" />
          Power Options
        </CardTitle>
      </CardHeader>
      <CardContent className="h-full">
        <div className="grid h-full grid-cols-2 grid-rows-2 gap-4 [&_button]:h-full [&_button]:min-h-14">
          {powerActions.actions.map((action: VmPowerActionItem) => {
            const ActionIcon = action.icon

            return (
              <Button
                key={action.action}
                variant="outline"
                onClick={() =>
                  powerActions.openPowerAction(action.action, openConfirm)
                }
                disabled={action.disabled}
              >
                <ActionIcon
                  data-icon="inline-start"
                  className="text-muted-foreground"
                />
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
