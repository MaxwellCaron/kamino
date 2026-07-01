import { showSingleMutationToast } from "@/components/feedback/mutation-progress-toast"
import { formatVmReference } from "@/features/shared/utils/format"

export function toastCloneVm(
  promise: Promise<{ vmid: number }>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  showSingleMutationToast({
    title: "Cloning",
    name: vmIdentifier,
    promise,
    successDescription: "Cloned",
  })
}

export function toastCreateVm(
  promise: Promise<{ vmid: number }>,
  method: "template" | "iso" | "upload",
  templateName?: string
) {
  const title =
    method === "template"
      ? `Cloning template ${templateName ?? "template"}`
      : method === "iso"
        ? "Creating VM"
        : "Preparing upload workflow"
  const successDescription =
    method === "template" ? "Cloned" : method === "iso" ? "Created" : "Ready"

  showSingleMutationToast({
    title,
    name: templateName ?? "VM",
    promise,
    successDescription,
  })
}

export function toastUpdateHardware(
  promise: Promise<unknown>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  showSingleMutationToast({
    title: "Updating hardware",
    name: vmIdentifier,
    promise,
    successDescription: "Hardware updated",
  })
}

export function toastCreateSnapshot(
  promise: Promise<unknown>,
  snapname: string
) {
  showSingleMutationToast({
    title: "Creating snapshot",
    name: snapname,
    promise,
    successDescription: "Created",
  })
}

export function toastSubmitSnapshotRequest(
  promise: Promise<unknown>,
  snapname: string
) {
  showSingleMutationToast({
    title: "Submitting snapshot request",
    name: snapname,
    promise,
    successDescription: "Submitted",
  })
}

export function toastRollbackSnapshot(
  promise: Promise<unknown>,
  snapname: string
) {
  showSingleMutationToast({
    title: "Rolling back",
    name: snapname,
    promise,
    successDescription: "Rolled back",
  })
}

export function toastSubmitRollbackRequest(
  promise: Promise<unknown>,
  snapname: string
) {
  showSingleMutationToast({
    title: "Submitting rollback request",
    name: snapname,
    promise,
    successDescription: "Submitted",
  })
}

export function toastDeleteSnapshot(
  promise: Promise<unknown>,
  snapname: string
) {
  showSingleMutationToast({
    title: "Deleting snapshot",
    name: snapname,
    promise,
    successDescription: "Deleted",
  })
}

export function toastUpdateNotes(promise: Promise<unknown>) {
  showSingleMutationToast({
    title: "Updating notes",
    name: "VM notes",
    promise,
    successDescription: "Updated",
  })
}

export function toastDeleteVm(
  promise: Promise<unknown>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  showSingleMutationToast({
    title: "Deleting",
    name: vmIdentifier,
    promise,
    successDescription: "Deleted",
  })
}

export function toastTemplatizeVm(
  promise: Promise<unknown>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  showSingleMutationToast({
    title: "Templatizing",
    name: vmIdentifier,
    promise,
    successDescription: "Templatized",
  })
}
