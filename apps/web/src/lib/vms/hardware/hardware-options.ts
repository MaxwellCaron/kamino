export const scsiControllers = [
  { label: "Virtio SCSI single", value: "virtio-scsi-single" },
  { label: "Virtio SCSI", value: "virtio-scsi-pci" },
  { label: "LSI 53C895A", value: "lsi" },
  { label: "LSI 53C810", value: "lsi53c810" },
  { label: "MegaRAID SAS 8708EM2", value: "megasas" },
  { label: "VMware PVSCSI", value: "pvscsi" },
] as const

export const machineTypes = [
  { label: "i440fx", value: "pc" },
  { label: "q35", value: "q35" },
] as const

export const biosTypes = [
  { label: "SeaBIOS", value: "seabios" },
  { label: "OVMF (UEFI)", value: "ovmf" },
] as const

export const osTypes = [
  { label: "Linux 2.6 - 6.X Kernel", value: "l26" },
  { label: "Linux 2.4 Kernel", value: "l24" },
  { label: "Microsoft Windows 11/2022/2025", value: "win11" },
  { label: "Microsoft Windows 10/2016/2019", value: "win10" },
  { label: "Microsoft Windows 8/2012/2012r2", value: "win8" },
  { label: "Microsoft Windows 7", value: "win7" },
  { label: "Microsoft Windows 2008", value: "w2k8" },
  { label: "Microsoft Windows 2003", value: "w2k3" },
  { label: "Microsoft Windows 2000", value: "w2k" },
  { label: "Microsoft Windows Vista", value: "wvista" },
  { label: "Microsoft Windows XP", value: "wxp" },
  { label: "Other", value: "other" },
] as const

export const cpuTypes = [
  { label: "kvm32", value: "kvm32" },
  { label: "kvm64", value: "kvm64" },
  { label: "max", value: "max" },
  { label: "qemu32", value: "qemu32" },
  { label: "qemu64", value: "qemu64" },
  { label: "x86-64-v2", value: "x86-64-v2" },
  { label: "x86-64-v2-AES", value: "x86-64-v2-AES" },
  { label: "x86-64-v3", value: "x86-64-v3" },
  { label: "x86-64-v4", value: "x86-64-v4" },
  { label: "host", value: "host" },
] as const

export const nicModels = [
  { label: "Virtio", value: "virtio" },
  { label: "Intel E1000", value: "e1000" },
  { label: "Intel E1000E", value: "e1000e" },
  { label: "Realtek RTL8139", value: "rtl8139" },
  { label: "VMware vmxnet3", value: "vmxnet3" },
] as const
