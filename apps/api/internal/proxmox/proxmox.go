package proxmox

import "github.com/google/uuid"

// intBool is a boolean type for 0 and 1 responses from the Proxmox API.
type intBool bool

func (b *intBool) UnmarshalJSON(data []byte) error {
	*b = data[0] == '1'
	return nil
}

// apiResponse wraps the standard Proxmox API JSON envelope.
type apiResponse[T any] struct {
	Data T `json:"data"`
}

type Pool struct {
	PoolID  string `json:"poolid"`
	Comment string `json:"comment"`
}

type VM struct {
	VMID      int     `json:"vmid"`
	Name      string  `json:"name"`
	Node      string  `json:"node"`
	Type      string  `json:"type"`
	CPU       float64 `json:"cpu"`
	MaxCPU    int     `json:"maxcpu"`
	Mem       int64   `json:"mem"`
	MaxMem    int64   `json:"maxmem"`
	Disk      int64   `json:"disk"`
	MaxDisk   int64   `json:"maxdisk"`
	NetIn     int64   `json:"netin"`
	NetOut    int64   `json:"netout"`
	DiskRead  int64   `json:"diskread"`
	DiskWrite int64   `json:"diskwrite"`
	Uptime    int64   `json:"uptime"`
	Pool      string  `json:"pool"`
	Status    string  `json:"status"`
	Template  int     `json:"template"`
}

func (v VM) IsTemplate() bool { return v.Template == 1 }

type GuestType string

const (
	GuestQEMU GuestType = "qemu"
	GuestLXC  GuestType = "lxc"
)

func GuestTypeFromVMType(t string) GuestType {
	if t == "lxc" {
		return GuestLXC
	}
	return GuestQEMU
}

type Node struct {
	Node   string  `json:"node"`
	Status string  `json:"status"`
	CPU    float64 `json:"cpu"`
	MaxCPU int     `json:"maxcpu"`
	Mem    int64   `json:"mem"`
	MaxMem int64   `json:"maxmem"`
}

type Storage struct {
	Storage string `json:"storage"`
	Type    string `json:"type"`
	Content string `json:"content"`
	Avail   int64  `json:"avail"`
	Total   int64  `json:"total"`
	Used    int64  `json:"used"`
	Shared  *int   `json:"shared,omitempty"`
}

type StorageWithClassification struct {
	Storage
	KaminoShared   bool `json:"kamino_shared"`
	KaminoExcluded bool `json:"kamino_excluded"`
}

type ISOContent struct {
	Volid  string `json:"volid"`
	Format string `json:"format"`
	Size   int64  `json:"size"`
}

type StorageContent struct {
	VolID string `json:"volid"`
	Size  int64  `json:"size"`
}

type VNet struct {
	Type         string  `json:"type,omitempty"`
	VNet         string  `json:"vnet"`
	Zone         string  `json:"zone"`
	Tag          int     `json:"tag,omitempty"`
	Alias        string  `json:"alias,omitempty"`
	VLANAware    intBool `json:"vlanaware,omitempty"`
	IsolatePorts intBool `json:"isolate-ports,omitempty"`
}

type SDNZone struct {
	Zone string `json:"zone"`
	Type string `json:"type,omitempty"`
}

type NetworkBridge struct {
	Iface    string `json:"iface"`
	Type     string `json:"type"`
	Active   int    `json:"active,omitempty"`
	Comments string `json:"comments,omitempty"`
}

type Snapshot struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Snaptime    int64   `json:"snaptime,omitempty"`
	Parent      string  `json:"parent,omitempty"`
	VMState     intBool `json:"vmstate,omitempty"`
}

type VMHardwareNetwork struct {
	Device     string `json:"device"`
	Bridge     string `json:"bridge"`
	Model      string `json:"model"`
	VLANTag    *int   `json:"vlan_tag,omitempty"`
	Firewall   bool   `json:"firewall"`
	LinkDown   bool   `json:"link_down,omitempty"`
	MACAddress string `json:"mac_address,omitempty"`
}

type VMHardwareConfig struct {
	OSType     string              `json:"ostype"`
	BIOS       string              `json:"bios"`
	Machine    string              `json:"machine"`
	SCSI       string              `json:"scsi"`
	Sockets    int                 `json:"sockets"`
	Cores      int                 `json:"cores"`
	CPUType    string              `json:"cpu_type"`
	Memory     int                 `json:"memory"`
	Balloon    int                 `json:"balloon"`
	DiskDevice string              `json:"disk_device,omitempty"`
	Storage    string              `json:"storage"`
	DiskSize   int                 `json:"disk_size"`
	Display    string              `json:"display"`
	Networks   []VMHardwareNetwork `json:"networks"`
}

type VMIdentity struct {
	Name         string
	IsTemplate   bool
	UpstreamUUID uuid.UUID
}

// VMConfigSummary contains the inventory metadata we can derive from a VM's
// config endpoint without scanning cluster-wide resources.
type VMConfigSummary struct {
	Name         string
	IsTemplate   bool
	UpstreamUUID uuid.UUID
	CPUCount     int32
	MemoryMB     int32
	DiskGB       *float64
	Notes        string
}

type GuestExecStatus struct {
	Exited   bool   `json:"exited"`
	ExitCode int    `json:"exitcode"`
	OutData  string `json:"out-data"`
	ErrData  string `json:"err-data"`
}
