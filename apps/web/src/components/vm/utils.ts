import {
  IconPlayerPlay,
  IconPlayerStop,
  IconPower,
  IconRefresh,
} from "@tabler/icons-react"
import { toast } from "sonner"
import type { ConfirmConfig } from "@/components/dialogs/confirm-dialog"
import type { ApiBulkVmMutationResponse } from "@/lib/queries"
import { formatVmReference } from "@/lib/utils"

export function getVmPowerActionConfig(
  action: "start" | "shutdown" | "reboot" | "stop",
  powerMode: "direct" | "request",
  vmid?: number | null,
  vmName?: string | null
): Omit<ConfirmConfig, "onConfirm"> {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return {
    start: {
      title: "Start",
      icon: IconPlayerPlay,
      description:
        powerMode === "direct"
          ? `This will power on ${vmIdentifier}.`
          : `Approval required. Powering on ${vmIdentifier} will be added to the queue for review.`,
      actionLabel: powerMode === "direct" ? "Start" : "Submit",
      variant: "default" as const,
    },
    shutdown: {
      title: "Shutdown",
      icon: IconPower,
      description:
        powerMode === "direct"
          ? `This will send a shutdown signal to ${vmIdentifier}.`
          : `Approval required. Shutting down ${vmIdentifier} will be added to the queue for review.`,
      actionLabel: powerMode === "direct" ? "Shutdown" : "Submit",
      variant: "destructive" as const,
    },
    reboot: {
      title: "Reboot",
      icon: IconRefresh,
      description:
        powerMode === "direct"
          ? `This will send a reboot signal to ${vmIdentifier}.`
          : `Approval required. Rebooting ${vmIdentifier} will be added to the queue for review.`,
      actionLabel: powerMode === "direct" ? "Reboot" : "Submit",
      variant: "destructive" as const,
    },
    stop: {
      title: "Stop",
      icon: IconPlayerStop,
      description:
        powerMode === "direct"
          ? `This will immediately stop ${vmIdentifier}.`
          : `Approval required. Stopping ${vmIdentifier} will be added to the queue for review.`,
      actionLabel: powerMode === "direct" ? "Stop" : "Submit",
      variant: "destructive" as const,
    },
  }[action]
}

export function toastVmPowerAction(
  promise: Promise<ApiBulkVmMutationResponse | any>,
  action: "start" | "shutdown" | "reboot" | "stop",
  powerMode: "direct" | "request",
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return toast.promise(promise, {
    loading:
      powerMode === "direct"
        ? `${action === "start" ? "Starting" : action === "shutdown" ? "Shutting down" : action === "reboot" ? "Rebooting" : "Stopping"} VM ${vmIdentifier}…`
        : `Submitting ${action} request for ${vmIdentifier}…`,
    success:
      powerMode === "direct"
        ? `VM ${vmIdentifier} ${action === "start" ? "started" : action === "shutdown" ? "shut down" : action === "reboot" ? "rebooted" : "stopped"}`
        : `${action.charAt(0).toUpperCase() + action.slice(1)} request for ${vmIdentifier} submitted`,
    error: (err: Error) => err.message,
  })
}

export function toastCloneVm(
  promise: Promise<{ vmid: number }>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return toast.promise(promise, {
    loading: `Cloning VM ${vmIdentifier}…`,
    success: (result) => `VM cloned to ${result.vmid}`,
    error: (error: Error) => error.message,
  })
}

export function toastCreateVm(
  promise: Promise<{ vmid: number }>,
  method: "template" | "iso" | "upload",
  templateName?: string
) {
  return toast.promise(promise, {
    loading:
      method === "template"
        ? `Cloning template ${templateName ?? "template"}…`
        : method === "iso"
          ? `Creating VM…`
          : "Preparing upload workflow…",
    success: (result) => {
      if (method === "template") {
        return `Template cloned to ${result.vmid}`
      }
      if (method === "iso") {
        return `VM ${result.vmid} created`
      }
      return "Upload workflow ready"
    },
    error: (error: Error) => error.message,
  })
}

export function toastUpdateHardware(
  promise: Promise<any>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return toast.promise(promise, {
    loading: `Updating hardware for ${vmIdentifier}...`,
    success: `Hardware updated for ${vmIdentifier}`,
    error: (error: Error) => error.message,
  })
}

export function toastCreateSnapshot(promise: Promise<any>, snapname: string) {
  return toast.promise(promise, {
    loading: `Creating snapshot "${snapname}"…`,
    success: `Snapshot "${snapname}" created`,
    error: (err: Error) => err.message,
  })
}

export function toastSubmitSnapshotRequest(
  promise: Promise<any>,
  snapname: string
) {
  return toast.promise(promise, {
    loading: `Submitting snapshot request for "${snapname}"…`,
    success: (request) => {
      const name = request.inventory?.snapshot_name || snapname
      return `Snapshot request "${name}" submitted`
    },
    error: (err: Error) => err.message,
  })
}

export function toastRollbackSnapshot(promise: Promise<any>, snapname: string) {
  return toast.promise(promise, {
    loading: `Rolling back to "${snapname}"…`,
    success: `Rolled back to "${snapname}"`,
    error: (err: Error) => err.message,
  })
}

export function toastSubmitRollbackRequest(
  promise: Promise<any>,
  snapname: string
) {
  return toast.promise(promise, {
    loading: `Submitting rollback request for "${snapname}"…`,
    success: `Rollback request for "${snapname}" submitted`,
    error: (err: Error) => err.message,
  })
}

export function toastDeleteSnapshot(promise: Promise<any>, snapname: string) {
  return toast.promise(promise, {
    loading: `Deleting snapshot "${snapname}"…`,
    success: `Snapshot "${snapname}" deleted`,
    error: (err: Error) => err.message,
  })
}

export function toastUpdateNotes(promise: Promise<any>) {
  return toast.promise(promise, {
    loading: "Updating VM notes...",
    success: (result) =>
      result.synced
        ? "VM notes updated"
        : "VM notes saved. Proxmox sync is pending.",
    error: (error: Error) => error.message,
  })
}

export function toastDeleteVm(
  promise: Promise<any>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return toast.promise(promise, {
    loading: `Deleting VM ${vmIdentifier}…`,
    success: `VM ${vmIdentifier} deleted`,
    error: (err: Error) => err.message,
  })
}

export function toastTemplatizeVm(
  promise: Promise<any>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return toast.promise(promise, {
    loading: `Templatizing VM ${vmIdentifier}…`,
    success: `VM ${vmIdentifier} templatized`,
    error: (err: Error) => err.message,
  })
}
