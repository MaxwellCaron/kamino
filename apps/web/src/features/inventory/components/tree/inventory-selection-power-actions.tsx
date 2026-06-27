import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlayIcon,
  PowerIcon,
  ReloadIcon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import {
  ActionBarItem,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"
import type {
  ConfirmConfig,
  ConfirmDialogControls,
} from "@/components/dialogs/confirm-dialog"
import type { SelectedVmItem } from "../../types/inventory-types"

type InventorySelectionPowerActionsProps = {
  canTemplate: boolean
  canDelete: boolean
  powerSelectionLabel: string
  powerVmItems: Array<SelectedVmItem>
  getStatus: (itemId: string) => string | undefined
  openConfirm: (config: ConfirmConfig) => void
  createPowerConfirmStatusItems: (
    items: Array<SelectedVmItem>,
    action: "start" | "shutdown" | "reboot" | "stop",
    getStatus: (itemId: string) => string | undefined
  ) => ConfirmConfig["statusItems"]
  runPowerAction: (
    action: "start" | "shutdown" | "reboot" | "stop",
    controls: ConfirmDialogControls
  ) => Promise<void>
}

export function InventorySelectionPowerActions({
  canTemplate,
  canDelete,
  powerSelectionLabel,
  powerVmItems,
  getStatus,
  openConfirm,
  createPowerConfirmStatusItems,
  runPowerAction,
}: InventorySelectionPowerActionsProps) {
  return (
    <>
      <ActionBarItem
        onSelect={(event) => event.preventDefault()}
        onClick={() =>
          openConfirm({
            title: "Start",
            icon: PlayIcon,
            description: <p>This will power on {powerSelectionLabel}.</p>,
            actionLabel: "Start",
            closeOnSuccess: false,
            statusItems: createPowerConfirmStatusItems(
              powerVmItems,
              "start",
              getStatus
            ),
            onConfirm: (controls) => runPowerAction("start", controls),
          })
        }
        aria-label="Start selected VMs"
        tooltip="Start"
        variant="default"
      >
        <HugeiconsIcon icon={PlayIcon} />
      </ActionBarItem>
      <ActionBarItem
        onSelect={(event) => event.preventDefault()}
        onClick={() =>
          openConfirm({
            title: "Shutdown",
            icon: PowerIcon,
            description: (
              <p>This will send a shutdown signal to {powerSelectionLabel}.</p>
            ),
            actionLabel: "Shutdown",
            closeOnSuccess: false,
            statusItems: createPowerConfirmStatusItems(
              powerVmItems,
              "shutdown",
              getStatus
            ),
            variant: "destructive",
            onConfirm: (controls) => runPowerAction("shutdown", controls),
          })
        }
        aria-label="Shut down selected VMs"
        tooltip="Shutdown"
      >
        <HugeiconsIcon icon={PowerIcon} />
      </ActionBarItem>
      <ActionBarItem
        onSelect={(event) => event.preventDefault()}
        onClick={() =>
          openConfirm({
            title: "Reboot",
            icon: ReloadIcon,
            description: (
              <p>This will send a reboot signal to {powerSelectionLabel}.</p>
            ),
            actionLabel: "Reboot",
            closeOnSuccess: false,
            statusItems: createPowerConfirmStatusItems(
              powerVmItems,
              "reboot",
              getStatus
            ),
            variant: "destructive",
            onConfirm: (controls) => runPowerAction("reboot", controls),
          })
        }
        aria-label="Reboot selected VMs"
        tooltip="Reboot"
      >
        <HugeiconsIcon icon={ReloadIcon} />
      </ActionBarItem>
      <ActionBarItem
        onSelect={(event) => event.preventDefault()}
        onClick={() =>
          openConfirm({
            title: "Stop",
            icon: StopIcon,
            description: (
              <p>This will immediately stop {powerSelectionLabel}.</p>
            ),
            actionLabel: "Stop",
            closeOnSuccess: false,
            statusItems: createPowerConfirmStatusItems(
              powerVmItems,
              "stop",
              getStatus
            ),
            variant: "destructive",
            onConfirm: (controls) => runPowerAction("stop", controls),
          })
        }
        aria-label="Stop selected VMs"
        tooltip="Stop"
      >
        <HugeiconsIcon icon={StopIcon} />
      </ActionBarItem>
      {(canTemplate || canDelete) && <ActionBarSeparator />}
    </>
  )
}
