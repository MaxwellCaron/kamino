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
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"

type InventorySelectionPowerActionsProps = {
  canTemplate: boolean
  canDelete: boolean
  powerSelectionLabel: string
  openConfirm: (config: ConfirmConfig) => void
  runPowerAction: (action: "start" | "shutdown" | "reboot" | "stop") => void
}

export function InventorySelectionPowerActions({
  canTemplate,
  canDelete,
  powerSelectionLabel,
  openConfirm,
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
            onConfirm: () => runPowerAction("start"),
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
            variant: "destructive",
            onConfirm: () => runPowerAction("shutdown"),
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
            variant: "destructive",
            onConfirm: () => runPowerAction("reboot"),
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
            variant: "destructive",
            onConfirm: () => runPowerAction("stop"),
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
