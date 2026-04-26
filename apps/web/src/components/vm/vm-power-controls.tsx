import {
  IconPlayerPlay,
  IconPlayerStop,
  IconPower,
  IconRefresh,
} from "@tabler/icons-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { ApiTreeNode } from "@/lib/queries"
import { useInventoryDialogs } from "@/components/inventory/inventory-dialogs-provider"
import {
  useSubmitInventoryPowerRequest,
  useVmPowerAction,
} from "@/hooks/use-vm-actions"
import { InventoryPermissionBits } from "@/lib/inventory-permissions"
import {
  getVmPowerActionConfig,
  toastVmPowerAction,
} from "@/components/vm/utils"
import { getInventoryPermissionMode } from "@/components/inventory/permissions/utils"

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
  const powerAction = useVmPowerAction()
  const submitPowerRequest = useSubmitInventoryPowerRequest()

  if (!node || !vm || isTemplate) return null

  const powerMode = getInventoryPermissionMode(
    node.permissions,
    InventoryPermissionBits.powerVm
  )
  const isRunning = powerStatus === "running"
  const handleAction = (action: "start" | "shutdown" | "reboot" | "stop") => {
    if (powerMode === null) return

    const config = getVmPowerActionConfig(action, powerMode, vm.vmid, node.name)

    openConfirm({
      ...config,
      onConfirm: () => {
        const promise =
          powerMode === "direct"
            ? powerAction
                .mutateAsync({ itemIds: [itemId], action })
                .then((result) => {
                  if (
                    result.failed.length > 0 ||
                    result.succeeded.length === 0
                  ) {
                    throw new Error(
                      result.failed[0]?.error ?? `Failed to ${action} VM`
                    )
                  }
                  return result
                })
            : submitPowerRequest.mutateAsync({
                itemId,
                action,
              })

        toastVmPowerAction(promise, action, powerMode, vm.vmid, node.name)
      },
    })
  }

  const isMutationPending =
    powerAction.isPending || submitPowerRequest.isPending
  const isDisabled = isGlobalLoading || isMutationPending || powerMode === null

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
          <Button
            onClick={() => handleAction("start")}
            disabled={isDisabled || isRunning}
          >
            <IconPlayerPlay data-icon="inline-start" />
            <span className="inline md:hidden 2xl:inline">Start</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleAction("shutdown")}
            disabled={isDisabled || !isRunning}
          >
            <IconPower data-icon="inline-start" />
            <span className="inline md:hidden 2xl:inline">Shutdown</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleAction("reboot")}
            disabled={isDisabled || !isRunning}
          >
            <IconRefresh data-icon="inline-start" />
            <span className="inline md:hidden 2xl:inline">Reboot</span>
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleAction("stop")}
            disabled={isDisabled || !isRunning}
          >
            <IconPlayerStop data-icon="inline-start" />
            <span className="inline md:hidden 2xl:inline">Stop</span>
          </Button>
        </div>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-muted-foreground">
          {powerMode === "request"
            ? "Power actions require approval."
            : "Start, shutdown, reboot, or stop this virtual machine."}
        </p>
      </CardFooter>
    </Card>
  )
}
