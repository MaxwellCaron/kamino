package handlers

import (
	"testing"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

func TestValidateVNetID(t *testing.T) {
	tests := []struct {
		name    string
		id      string
		wantErr bool
	}{
		{name: "valid minimum length", id: "ab", wantErr: false},
		{name: "valid maximum length", id: "abcdefgh", wantErr: false},
		{name: "valid alphanumeric", id: "pod245", wantErr: false},
		{name: "too short", id: "a", wantErr: true},
		{name: "too long", id: "abcdefghi", wantErr: true},
		{name: "starts with digit", id: "1abc", wantErr: true},
		{name: "contains hyphen", id: "my-vnet", wantErr: true},
		{name: "contains underscore", id: "my_vnet", wantErr: true},
		{name: "empty", id: "", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateVNetID(tt.id)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateVNetID(%q) error = %v, wantErr %v", tt.id, err, tt.wantErr)
			}
		})
	}
}

func TestValidateVNetTag(t *testing.T) {
	tests := []struct {
		name    string
		tag     int
		wantErr bool
	}{
		{name: "minimum valid", tag: 1, wantErr: false},
		{name: "maximum valid", tag: 16777215, wantErr: false},
		{name: "zero is invalid", tag: 0, wantErr: true},
		{name: "negative is invalid", tag: -1, wantErr: true},
		{name: "too large", tag: 16777216, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateVNetTag(tt.tag)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateVNetTag(%d) error = %v, wantErr %v", tt.tag, err, tt.wantErr)
			}
		})
	}
}

func TestToVNetResponseMapsIsolatePorts(t *testing.T) {
	v := proxmox.VNet{
		VNet:         "pod245",
		Zone:         "z1",
		VLANAware:    true,
		IsolatePorts: true,
	}
	resp := toVNetResponse(v)

	if resp.VNet != "pod245" {
		t.Errorf("VNet = %q, want %q", resp.VNet, "pod245")
	}
	if !resp.IsolatePorts {
		t.Error("IsolatePorts = false, want true")
	}
	if !resp.VLANAware {
		t.Error("VLANAware = false, want true")
	}
}
