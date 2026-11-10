import { Clock01Icon, ConnectIcon, PowerIcon } from "@hugeicons/core-free-icons"
import {
  VNC_PERFORMANCE_COMPRESSION_LEVEL,
  VNC_PERFORMANCE_QUALITY_LEVEL,
} from "@/lib/vms/vm-console-utils"
import type { VncScreenClientHandle } from "@/lib/vms/console/vnc-types"

export const VNC_QUALITY_LEVEL = VNC_PERFORMANCE_QUALITY_LEVEL

export const VNC_COMPRESSION_LEVEL = VNC_PERFORMANCE_COMPRESSION_LEVEL

export const VNC_IDLE_TIMEOUT_MS = 30 * 60 * 1000

export function getDisconnectedConsoleCopy(
  isRunning: boolean,
  isExpired: boolean
) {
  if (!isRunning) {
    return {
      description: "The VM must be running to open a console.",
      icon: PowerIcon,
      title: "VM Not Running",
    }
  }

  if (isExpired) {
    return {
      description:
        "This console was closed after 30 minutes away. Connect to start a new session.",
      icon: Clock01Icon,
      title: "Session Expired",
    }
  }

  return {
    description: "Connect to start an in-app console session.",
    icon: ConnectIcon,
    title: "Not Connected",
  }
}

export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":")
}

export const KEY_COMBOS = [
  {
    label: "Ctrl + Alt + Del",
    action: (ref: VncScreenClientHandle) => ref.sendCtrlAltDel(),
  },
  {
    label: "Tab",
    action: (ref: VncScreenClientHandle) => ref.sendKey(0xff09, "Tab"),
  },
  {
    label: "Escape",
    action: (ref: VncScreenClientHandle) => ref.sendKey(0xff1b, "Escape"),
  },
  {
    label: "F11",
    action: (ref: VncScreenClientHandle) => ref.sendKey(0xffc8, "F11"),
  },
] as const
