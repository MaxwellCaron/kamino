package proxmox

import (
	"github.com/google/uuid"
	"testing"
)

func TestInventorySummaryDoesNotRequireEditableDisk(t *testing.T) {
	for _, tc := range []struct {
		name string
		disk string
		want *float64
	}{
		{"diskless", "", new(float64(0))},
		{"normal", "local:vm-334-disk-0,size=8G", new(float64(8))},
		{"size unavailable", "local:vm-334-disk-0", nil},
		{"passthrough", "/dev/disk/by-id/example", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			data := map[string]any{"smbios1": "uuid=" + uuid.NewString()}
			if tc.disk != "" {
				data["scsi0"] = tc.disk
			}
			got, err := parseVMConfigSummary(data, 334)
			if err != nil {
				t.Fatal(err)
			}
			if got.Name != "VM 334" {
				t.Fatalf("unexpected name: %s", got.Name)
			}
			if (got.DiskGB == nil) != (tc.want == nil) || (tc.want != nil && *got.DiskGB != *tc.want) {
				t.Fatalf("unexpected disk size: %v", got.DiskGB)
			}
			if tc.name == "diskless" {
				if _, err := parseVMHardwareConfig(data); err == nil {
					t.Fatal("hardware editor should still reject missing editable disk")
				}
			}
		})
	}
}
