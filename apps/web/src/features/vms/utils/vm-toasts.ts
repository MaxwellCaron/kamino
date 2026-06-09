import { toast } from "sonner"
import {
  formatToastError,
  formatVmReference,
} from "@/features/shared/utils/format"

export function toastCloneVm(
  promise: Promise<{ vmid: number }>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return toast.promise(promise, {
    loading: `Cloning ${vmIdentifier}…`,
    success: (result) => `VM cloned to ${result.vmid}`,
    error: formatToastError,
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
    error: formatToastError,
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
    error: formatToastError,
  })
}

export function toastCreateSnapshot(promise: Promise<any>, snapname: string) {
  return toast.promise(promise, {
    loading: `Creating snapshot "${snapname}"…`,
    success: `Snapshot "${snapname}" created`,
    error: formatToastError,
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
    error: formatToastError,
  })
}

export function toastRollbackSnapshot(promise: Promise<any>, snapname: string) {
  return toast.promise(promise, {
    loading: `Rolling back to "${snapname}"…`,
    success: `Rolled back to "${snapname}"`,
    error: formatToastError,
  })
}

export function toastSubmitRollbackRequest(
  promise: Promise<any>,
  snapname: string
) {
  return toast.promise(promise, {
    loading: `Submitting rollback request for "${snapname}"…`,
    success: `Rollback request for "${snapname}" submitted`,
    error: formatToastError,
  })
}

export function toastDeleteSnapshot(promise: Promise<any>, snapname: string) {
  return toast.promise(promise, {
    loading: `Deleting snapshot "${snapname}"…`,
    success: `Snapshot "${snapname}" deleted`,
    error: formatToastError,
  })
}

export function toastUpdateNotes(promise: Promise<any>) {
  return toast.promise(promise, {
    loading: "Updating VM notes...",
    success: (result) =>
      result.synced
        ? "VM notes updated"
        : "VM notes saved. Proxmox sync is pending.",
    error: formatToastError,
  })
}

export function toastDeleteVm(
  promise: Promise<any>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return toast.promise(promise, {
    loading: `Deleting ${vmIdentifier}…`,
    success: `${vmIdentifier} deleted`,
    error: formatToastError,
  })
}

export function toastTemplatizeVm(
  promise: Promise<any>,
  vmid?: number | null,
  vmName?: string | null
) {
  const vmIdentifier = formatVmReference(vmid, vmName)

  return toast.promise(promise, {
    loading: `Templatizing ${vmIdentifier}…`,
    success: `${vmIdentifier} templatized`,
    error: formatToastError,
  })
}
