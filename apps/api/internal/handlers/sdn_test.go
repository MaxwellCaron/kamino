package handlers

import (
	"context"
	"errors"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/proxmox"
)

type fakeSDNVNetCreator struct {
	createCalls int
	applyCalls  int
	failOn      map[string]error
}

func (f *fakeSDNVNetCreator) CreateVNet(_ context.Context, params map[string]string) error {
	f.createCalls++
	if err, ok := f.failOn[params["vnet"]]; ok {
		return err
	}
	return nil
}

func (f *fakeSDNVNetCreator) ApplySDN(context.Context) error {
	f.applyCalls++
	return nil
}

func TestValidateAndBuildCreateVNetParams(t *testing.T) {
	t.Run("valid request with boolean flags", func(t *testing.T) {
		id, params, err := validateAndBuildCreateVNetParams(createVNetRequest{
			VNet:         "pod245",
			Zone:         "zone1",
			Tag:          245,
			Alias:        "Pod 245",
			VLANAware:    true,
			IsolatePorts: true,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if id != "pod245" {
			t.Fatalf("id = %q, want pod245", id)
		}
		if params["vlanaware"] != "1" {
			t.Fatalf("vlanaware = %q, want 1", params["vlanaware"])
		}
		if params["isolate-ports"] != "1" {
			t.Fatalf("isolate-ports = %q, want 1", params["isolate-ports"])
		}
	})

	t.Run("whitespace-only zone is invalid", func(t *testing.T) {
		_, _, err := validateAndBuildCreateVNetParams(createVNetRequest{
			VNet: "pod1",
			Zone: "   ",
		})
		if err == nil {
			t.Fatal("expected error for whitespace-only zone")
		}
	})

	t.Run("tag zero is omitted", func(t *testing.T) {
		_, params, err := validateAndBuildCreateVNetParams(createVNetRequest{
			VNet: "pod1",
			Zone: "zone1",
			Tag:  0,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if _, ok := params["tag"]; ok {
			t.Fatalf("tag should be omitted, got %q", params["tag"])
		}
	})

	t.Run("tag one is included", func(t *testing.T) {
		_, params, err := validateAndBuildCreateVNetParams(createVNetRequest{
			VNet: "pod1",
			Zone: "zone1",
			Tag:  1,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if params["tag"] != "1" {
			t.Fatalf("tag = %q, want 1", params["tag"])
		}
	})
}

func TestExecuteBulkCreateVNets(t *testing.T) {
	validItems := func(ids ...string) []validatedCreateVNet {
		items := make([]validatedCreateVNet, 0, len(ids))
		for _, id := range ids {
			items = append(items, validatedCreateVNet{
				id:   id,
				zone: "zone1",
				params: map[string]string{
					"type": "vnet",
					"vnet": id,
					"zone": "zone1",
				},
			})
		}
		return items
	}

	t.Run("three valid requests apply once", func(t *testing.T) {
		px := &fakeSDNVNetCreator{}
		resp := executeBulkCreateVNets(context.Background(), px, validItems("a1", "a2", "a3"), true)
		if px.createCalls != 3 {
			t.Fatalf("createCalls = %d, want 3", px.createCalls)
		}
		if px.applyCalls != 1 {
			t.Fatalf("applyCalls = %d, want 1", px.applyCalls)
		}
		if len(resp.Created) != 3 || len(resp.Failed) != 0 {
			t.Fatalf("Created = %v Failed = %v", resp.Created, resp.Failed)
		}
	})

	t.Run("partial failure still applies once", func(t *testing.T) {
		px := &fakeSDNVNetCreator{failOn: map[string]error{
			"a2": errors.New("create failed"),
		}}
		resp := executeBulkCreateVNets(context.Background(), px, validItems("a1", "a2", "a3"), true)
		if px.applyCalls != 1 {
			t.Fatalf("applyCalls = %d, want 1", px.applyCalls)
		}
		if len(resp.Created) != 2 || len(resp.Failed) != 1 {
			t.Fatalf("Created = %v Failed = %v", resp.Created, resp.Failed)
		}
	})

	t.Run("all failures skip apply", func(t *testing.T) {
		px := &fakeSDNVNetCreator{failOn: map[string]error{
			"a1": errors.New("create failed"),
			"a2": errors.New("create failed"),
		}}
		resp := executeBulkCreateVNets(context.Background(), px, validItems("a1", "a2"), true)
		if px.applyCalls != 0 {
			t.Fatalf("applyCalls = %d, want 0", px.applyCalls)
		}
		if len(resp.Created) != 0 || len(resp.Failed) != 2 {
			t.Fatalf("Created = %v Failed = %v", resp.Created, resp.Failed)
		}
	})

	t.Run("can skip apply for staged frontend flow", func(t *testing.T) {
		px := &fakeSDNVNetCreator{}
		resp := executeBulkCreateVNets(context.Background(), px, validItems("a1", "a2"), false)
		if px.applyCalls != 0 {
			t.Fatalf("applyCalls = %d, want 0", px.applyCalls)
		}
		if len(resp.Created) != 2 || len(resp.Failed) != 0 {
			t.Fatalf("Created = %v Failed = %v", resp.Created, resp.Failed)
		}
	})
}

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
