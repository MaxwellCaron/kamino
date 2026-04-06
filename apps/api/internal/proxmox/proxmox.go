package proxmox

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
