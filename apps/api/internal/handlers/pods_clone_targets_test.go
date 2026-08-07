package handlers

import (
	"context"
	"testing"
)

func validPodCloneTargetRequest() podCloneTargetRequest {
	return podCloneTargetRequest{
		Key:               "lab2",
		Label:             "Lab 2",
		NetworkProfileKey: "lan-dmz-router-v1",
		LANVNet:           "pod2",
		DMZVNet:           "dmz2",
		WANBridge:         "vmbr9",
		WANSubnet:         "172.30.0.0/16",
		NetworkMin:        10,
		NetworkMax:        60,
		CloudInitStorage:  "local",
	}
}

func TestNormalizePodCloneTargetRequest(t *testing.T) {
	target, reqErr := normalizePodCloneTargetRequest(validPodCloneTargetRequest(), true)
	if reqErr != nil {
		t.Fatalf("normalizePodCloneTargetRequest() error = %v", reqErr)
	}

	if target.WANSubnet != "172.30.0.0/16" {
		t.Fatalf("WANSubnet = %q, want %q", target.WANSubnet, "172.30.0.0/16")
	}
	if got := target.CloudInitUserFilePattern(); got != "kamino-lab2-router-{network}-user-data.yaml" {
		t.Fatalf("LAN user-data pattern = %q", got)
	}
	if got := target.CloudInitNetworkFile(); got != "kamino-lab2-router-network-config.yaml" {
		t.Fatalf("LAN network-config file = %q", got)
	}
	if got := target.LANDMZUserFilePattern(); got != "kamino-lab2-router-lan-dmz-{network}-user-data.yaml" {
		t.Fatalf("LAN + DMZ user-data pattern = %q", got)
	}
	if got := target.LANDMZNetworkFile(); got != "kamino-lab2-router-lan-dmz-network-config.yaml" {
		t.Fatalf("LAN + DMZ network-config file = %q", got)
	}
	if target.Network().WANBridge != "vmbr9" || target.Network().LANVNet != "pod2" {
		t.Fatalf("Network() = %#v", target.Network())
	}
}

func TestNormalizePodCloneTargetRequestRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*podCloneTargetRequest)
		wantKey bool
	}{
		{"empty key", func(r *podCloneTargetRequest) { r.Key = "" }, true},
		{"uppercase key", func(r *podCloneTargetRequest) { r.Key = "Lab2" }, true},
		{"identical vnets", func(r *podCloneTargetRequest) { r.DMZVNet = r.LANVNet }, true},
		{"short vnet", func(r *podCloneTargetRequest) { r.LANVNet = "p" }, true},
		{"missing wan bridge", func(r *podCloneTargetRequest) { r.WANBridge = " " }, true},
		{"wan subnet not /16", func(r *podCloneTargetRequest) { r.WANSubnet = "172.30.0.0/24" }, true},
		{"wan subnet host address", func(r *podCloneTargetRequest) { r.WANSubnet = "172.30.5.0/16" }, true},
		{"wan subnet not cidr", func(r *podCloneTargetRequest) { r.WANSubnet = "172.30." }, true},
		{"unknown profile", func(r *podCloneTargetRequest) { r.NetworkProfileKey = "nope" }, true},
		{"network min below range", func(r *podCloneTargetRequest) { r.NetworkMin = 0 }, true},
		{"network max above range", func(r *podCloneTargetRequest) { r.NetworkMax = 255 }, true},
		{"inverted range", func(r *podCloneTargetRequest) { r.NetworkMin = 90; r.NetworkMax = 10 }, true},
		{"LAN-only target with a DMZ VNet", func(r *podCloneTargetRequest) {
			r.NetworkProfileKey = "lan-router-v1"
		}, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := validPodCloneTargetRequest()
			tt.mutate(&req)
			if _, reqErr := normalizePodCloneTargetRequest(req, tt.wantKey); reqErr == nil {
				t.Fatalf("expected validation error for %s", tt.name)
			}
		})
	}
}

// An update omits the key, which comes from the route instead.
func TestNormalizePodCloneTargetRequestAllowsMissingKeyOnUpdate(t *testing.T) {
	req := validPodCloneTargetRequest()
	req.Key = ""
	if _, reqErr := normalizePodCloneTargetRequest(req, false); reqErr != nil {
		t.Fatalf("normalizePodCloneTargetRequest() error = %v", reqErr)
	}
}

func TestEnsureVNetsValidAllowsLANOnlyTarget(t *testing.T) {
	handler := newRouterCloneOptionsHandler(t, []map[string]any{
		validVNet("personal", 1000),
	})

	if reqErr := handler.ensureVNetsValid(
		context.Background(),
		[]string{"personal", ""},
		nil,
	); reqErr != nil {
		t.Fatalf("ensureVNetsValid() error = %q", reqErr.UserMessage)
	}
}
