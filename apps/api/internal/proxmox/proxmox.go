package proxmox

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

// Pool represents a Proxmox resource pool.
type Pool struct {
	PoolID  string `json:"poolid"`
	Comment string `json:"comment"`
}

// VM represents a virtual machine from the Proxmox cluster resources API.
type VM struct {
	VMID     int    `json:"vmid"`
	Name     string `json:"name"`
	Node     string `json:"node"`
	Type     string `json:"type"`
	MaxCPU   int    `json:"maxcpu"`
	MaxMem   int64  `json:"maxmem"`
	MaxDisk  int64  `json:"maxdisk"`
	Pool     string `json:"pool"`
	Status   string `json:"status"`
	Template int    `json:"template"`
}

// IsTemplate returns true if the VM is a Proxmox template.
func (v VM) IsTemplate() bool { return v.Template == 1 }

// Node represents a cluster node from the Proxmox API.
type Node struct {
	Node   string  `json:"node"`
	Status string  `json:"status"`
	CPU    float64 `json:"cpu"`
	MaxCPU int     `json:"maxcpu"`
	Mem    int64   `json:"mem"`
	MaxMem int64   `json:"maxmem"`
}

// Storage represents a storage resource from the Proxmox API.
type Storage struct {
	Storage string `json:"storage"`
	Type    string `json:"type"`
	Content string `json:"content"`
	Avail   int64  `json:"avail"`
	Total   int64  `json:"total"`
	Used    int64  `json:"used"`
}

// ISOContent represents an ISO file in a storage.
type ISOContent struct {
	Volid  string `json:"volid"`
	Format string `json:"format"`
	Size   int64  `json:"size"`
}

// VNet represents a Software Defined Network virtual network.
type VNet struct {
	VNet  string `json:"vnet"`
	Zone  string `json:"zone"`
	Tag   int    `json:"tag,omitempty"`
	Alias string `json:"alias,omitempty"`
}

// Snapshot represents a VM snapshot from the Proxmox API.
type Snapshot struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Snaptime    int64   `json:"snaptime,omitempty"`
	Parent      string  `json:"parent,omitempty"`
	VMState     intBool `json:"vmstate,omitempty"`
}
