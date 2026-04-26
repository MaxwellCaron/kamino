import { useCallback } from "react"
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconPower,
  IconRefresh,
} from "@tabler/icons-react"
import { toast } from "sonner"
import type { ComponentProps, ComponentType } from "react"
import type { Button } from "@workspace/ui/components/button"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type {
  ApiBulkVmMutationResponse,
  ApiTreeNodePermissions,
} from "@/lib/queries"
import { getInventoryPermissionMode } from "@/components/inventory/permissions/utils"
import {
  useSubmitInventoryPowerRequest,
  useVmPowerAction,
} from "@/hooks/use-vm-actions"
import { InventoryPermissionBits } from "@/lib/inventory-permissions"
import { formatVmReference } from "@/lib/utils"

export type VmPowerAction = "start" | "shutdown" | "reboot" | "stop"
export type VmPowerMode = "direct" | "request"

type PowerIcon = ComponentType<{
  className?: string
  "data-icon"?: "inline-start" | "inline-end"
}>

type ButtonVariant = ComponentProps<typeof Button>["variant"]

type VmPowerActionDefinition = {
  action: VmPowerAction
  label: string
  icon: PowerIcon
  buttonVariant: ButtonVariant
  dialogVariant: NonNullable<ConfirmConfig["variant"]>
  directDescription: (vmIdentifier: string) => string
  requestDescription: (vmIdentifier: string) => string
  directLoading: string
  directSuccess: string
  requestLoading: string
}

export type VmPowerActionItem = VmPowerActionDefinition & {
  disabled: boolean
  disabledReason?: string
}

type UseVmPowerActionsOptions = {
  itemId: string
  permissions?: ApiTreeNodePermissions
  powerStatus?: string
  vmid?: number | null
  vmName?: string | null
  isLoading?: boolean
}

const VM_POWER_ACTION_DEFINITIONS: Array<VmPowerActionDefinition> = [
  {
    action: "start",
    label: "Start",
    icon: IconPlayerPlay,
    buttonVariant: "default",
    dialogVariant: "default",
    directDescription: (vmIdentifier) => `This will power on ${vmIdentifier}.`,
    requestDescription: (vmIdentifier) =>
      `Approval required. Powering on ${vmIdentifier} will be added to the queue for review.`,
    directLoading: "Starting",
    directSuccess: "started",
    requestLoading: "start",
  },
  {
    action: "shutdown",
    label: "Shutdown",
    icon: IconPower,
    buttonVariant: "secondary",
    dialogVariant: "destructive",
    directDescription: (vmIdentifier) =>
      `This will send a shutdown signal to ${vmIdentifier}.`,
    requestDescription: (vmIdentifier) =>
      `Approval required. Shutting down ${vmIdentifier} will be added to the queue for review.`,
    directLoading: "Shutting down",
    directSuccess: "shut down",
    requestLoading: "shutdown",
  },
  {
    action: "reboot",
    label: "Reboot",
    icon: IconRefresh,
    buttonVariant: "secondary",
    dialogVariant: "destructive",
    directDescription: (vmIdentifier) =>
      `This will send a reboot signal to ${vmIdentifier}.`,
    requestDescription: (vmIdentifier) =>
      `Approval required. Rebooting ${vmIdentifier} will be added to the queue for review.`,
    directLoading: "Rebooting",
    directSuccess: "rebooted",
    requestLoading: "reboot",
  },
  {
    action: "stop",
    label: "Stop",
    icon: IconPlayerStop,
    buttonVariant: "destructive",
    dialogVariant: "destructive",
    directDescription: (vmIdentifier) =>
      `This will immediately stop ${vmIdentifier}.`,
    requestDescription: (vmIdentifier) =>
      `Approval required. Stopping ${vmIdentifier} will be added to the queue for review.`,
    directLoading: "Stopping",
    directSuccess: "stopped",
    requestLoading: "stop",
  },
]

export function getVmPowerActionsCardDescription(
  powerMode: VmPowerMode | null
) {
  if (powerMode === "request") {
    return "Power actions require approval."
  }

  return "Start, shutdown, reboot, or stop this virtual machine."
}

function getVmPowerActionDefinition(action: VmPowerAction) {
  return VM_POWER_ACTION_DEFINITIONS.find((item) => item.action === action)!
}

function getVmPowerActionDisabledReason(
  action: VmPowerAction,
  powerStatus?: string
) {
  if (action === "start") {
    return powerStatus === "running" ? "VM is already running." : undefined
  }

  return powerStatus === "running" ? undefined : "VM is not running."
}

function assertSingleItemMutationSucceeded(
  result: ApiBulkVmMutationResponse,
  fallback: string
) {
  if (result.failed.length > 0 || result.succeeded.length === 0) {
    throw new Error(result.failed[0]?.error ?? fallback)
  }

  return result
}

function getVmPowerActionConfig(
  action: VmPowerAction,
  powerMode: VmPowerMode,
  vmid?: number | null,
  vmName?: string | null
): Omit<ConfirmConfig, "onConfirm"> {
  const definition = getVmPowerActionDefinition(action)
  const vmIdentifier = formatVmReference(vmid, vmName)

  return {
    title: definition.label,
    icon: definition.icon,
    description:
      powerMode === "direct"
        ? definition.directDescription(vmIdentifier)
        : definition.requestDescription(vmIdentifier),
    actionLabel: powerMode === "direct" ? definition.label : "Submit",
    variant: definition.dialogVariant,
  }
}

function toastVmPowerAction(
  promise: Promise<unknown>,
  action: VmPowerAction,
  powerMode: VmPowerMode,
  vmid?: number | null,
  vmName?: string | null
) {
  const definition = getVmPowerActionDefinition(action)
  const vmIdentifier = formatVmReference(vmid, vmName)

  return toast.promise(promise, {
    loading:
      powerMode === "direct"
        ? `${definition.directLoading} VM ${vmIdentifier}…`
        : `Submitting ${definition.requestLoading} request for ${vmIdentifier}…`,
    success:
      powerMode === "direct"
        ? `VM ${vmIdentifier} ${definition.directSuccess}`
        : `${definition.label} request for ${vmIdentifier} submitted`,
    error: (err: Error) => err.message,
  })
}

export function useVmPowerActions({
  itemId,
  permissions,
  powerStatus,
  vmid,
  vmName,
  isLoading,
}: UseVmPowerActionsOptions) {
  const powerAction = useVmPowerAction()
  const submitPowerRequest = useSubmitInventoryPowerRequest()
  const powerMode = getInventoryPermissionMode(
    permissions,
    InventoryPermissionBits.powerVm
  )
  const isPending = powerAction.isPending || submitPowerRequest.isPending
  const isGloballyDisabled = isLoading || isPending || powerMode === null

  const actions = VM_POWER_ACTION_DEFINITIONS.map((definition) => {
    const disabledReason = getVmPowerActionDisabledReason(
      definition.action,
      powerStatus
    )

    return {
      ...definition,
      disabled: isGloballyDisabled || disabledReason !== undefined,
      disabledReason,
    }
  })

  const openPowerAction = useCallback(
    (action: VmPowerAction, openConfirm: (config: ConfirmConfig) => void) => {
      if (powerMode === null) return
      if (getVmPowerActionDisabledReason(action, powerStatus)) return

      openConfirm({
        ...getVmPowerActionConfig(action, powerMode, vmid, vmName),
        onConfirm: () => {
          const promise: Promise<unknown> =
            powerMode === "direct"
              ? powerAction
                  .mutateAsync({ itemIds: [itemId], action })
                  .then((result) =>
                    assertSingleItemMutationSucceeded(
                      result,
                      `Failed to ${action} VM ${formatVmReference(vmid, vmName)}`
                    )
                  )
              : submitPowerRequest.mutateAsync({
                  itemId,
                  action,
                })

          toastVmPowerAction(promise, action, powerMode, vmid, vmName)
        },
      })
    },
    [
      itemId,
      powerAction,
      powerMode,
      powerStatus,
      submitPowerRequest,
      vmName,
      vmid,
    ]
  )

  return {
    actions,
    powerMode,
    isPending,
    isDisabled: isGloballyDisabled,
    cardDescription: getVmPowerActionsCardDescription(powerMode),
    openPowerAction,
  }
}
