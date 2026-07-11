import {
  PlayIcon,
  PowerIcon,
  Refresh03Icon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import type { InventoryPowerAction } from "../../utils/inventory-power-actions"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"

export const FOLDER_POWER_ACTION_DEFINITIONS: Array<{
  action: InventoryPowerAction
  label: string
  icon: IconSvgElement
  dialogVariant: NonNullable<ConfirmConfig["variant"]>
  description: (count: string, folderName: string) => string
}> = [
  {
    action: "start",
    label: "Start",
    icon: PlayIcon,
    dialogVariant: "default",
    description: (count, folderName) =>
      `This will power on the ${count} in folder "${folderName}".`,
  },
  {
    action: "shutdown",
    label: "Shutdown",
    icon: PowerIcon,
    dialogVariant: "destructive",
    description: (count, folderName) =>
      `This will send a shutdown signal to the ${count} in folder "${folderName}".`,
  },
  {
    action: "reboot",
    label: "Reboot",
    icon: Refresh03Icon,
    dialogVariant: "destructive",
    description: (count, folderName) =>
      `This will send a reboot signal to the ${count} in folder "${folderName}".`,
  },
  {
    action: "stop",
    label: "Stop",
    icon: StopIcon,
    dialogVariant: "destructive",
    description: (count, folderName) =>
      `This will immediately stop the ${count} in folder "${folderName}".`,
  },
]
