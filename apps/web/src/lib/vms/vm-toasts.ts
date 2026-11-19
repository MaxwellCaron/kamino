import type { SingleMutationToastOptions } from "@/lib/mutation-progress-toast"
import { formatVmReference } from "@/lib/vms/vm-reference"

export function getCloneVmToastOptions(
  promise: Promise<{ vmid: number }>,
  vmid?: number | null,
  vmName?: string | null
): SingleMutationToastOptions {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return {
    title: "Cloning",
    name: vmIdentifier,
    promise,
    successDescription: "Cloned",
  }
}

export function getCreateVmToastOptions(
  promise: Promise<{ vmid: number }>,
  method: "template" | "iso" | "upload",
  templateName?: string
): SingleMutationToastOptions {
  const title =
    method === "template"
      ? `Cloning template ${templateName ?? "template"}`
      : method === "iso"
        ? "Creating VM"
        : "Preparing upload workflow"
  const successDescription =
    method === "template" ? "Cloned" : method === "iso" ? "Created" : "Ready"

  return {
    title,
    name: templateName ?? "VM",
    promise,
    successDescription,
  }
}

export function getUpdateHardwareToastOptions(
  promise: Promise<unknown>,
  vmid?: number | null,
  vmName?: string | null
): SingleMutationToastOptions {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return {
    title: "Updating hardware",
    name: vmIdentifier,
    promise,
    successDescription: "Hardware updated",
  }
}

export function getCreateSnapshotToastOptions(
  promise: Promise<unknown>,
  snapname: string
): SingleMutationToastOptions {
  return {
    title: "Creating snapshot",
    name: snapname,
    promise,
    successDescription: "Created",
  }
}

export function getSubmitSnapshotRequestToastOptions(
  promise: Promise<unknown>,
  snapname: string
): SingleMutationToastOptions {
  return {
    title: "Submitting snapshot request",
    name: snapname,
    promise,
    successDescription: "Submitted",
  }
}

export function getRollbackSnapshotToastOptions(
  promise: Promise<unknown>,
  snapname: string
): SingleMutationToastOptions {
  return {
    title: "Rolling back",
    name: snapname,
    promise,
    successDescription: "Rolled back",
  }
}

export function getSubmitRollbackRequestToastOptions(
  promise: Promise<unknown>,
  snapname: string
): SingleMutationToastOptions {
  return {
    title: "Submitting rollback request",
    name: snapname,
    promise,
    successDescription: "Submitted",
  }
}

export function getDeleteSnapshotToastOptions(
  promise: Promise<unknown>,
  snapname: string
): SingleMutationToastOptions {
  return {
    title: "Deleting snapshot",
    name: snapname,
    promise,
    successDescription: "Deleted",
  }
}

export function getUpdateNotesToastOptions(
  promise: Promise<unknown>
): SingleMutationToastOptions {
  return {
    title: "Updating notes",
    name: "VM notes",
    promise,
    successDescription: "Updated",
  }
}

export function getDownloadSpiceConfigToastOptions(
  promise: Promise<unknown>,
  vmid?: number | null,
  vmName?: string | null
): SingleMutationToastOptions {
  return {
    title: "Downloading SPICE config",
    name: formatVmReference(vmid, vmName),
    promise,
    successDescription: "Downloaded",
  }
}

export function getDeleteVmToastOptions(
  promise: Promise<unknown>,
  vmid?: number | null,
  vmName?: string | null
): SingleMutationToastOptions {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return {
    title: "Deleting",
    name: vmIdentifier,
    promise,
    successDescription: "Deleted",
  }
}

export function getTemplatizeVmToastOptions(
  promise: Promise<unknown>,
  vmid?: number | null,
  vmName?: string | null
): SingleMutationToastOptions {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return {
    title: "Templatizing",
    name: vmIdentifier,
    promise,
    successDescription: "Templatized",
  }
}
