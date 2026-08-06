package handlers

import "testing"

func validPodCloneTargetRequest() podCloneTargetRequest {
	return podCloneTargetRequest{
		Key:                      "lab2",
		Label:                    "Lab 2",
		LANVNet:                  "pod2",
		DMZVNet:                  "dmz2",
		WANBridge:                "vmbr9",
		WANIPBase:                "172.30",
		CloudInitStorage:         "local",
		CloudInitUserFilePattern: "lab2-router-{network}-user-data.yaml",
		CloudInitNetworkFile:     "lab2-router-network-config.yaml",
		LANDMZUserFilePattern:    "lab2-router-dmz-{network}-user-data.yaml",
		LANDMZNetworkFile:        "lab2-router-dmz-network-config.yaml",
	}
}

func TestNormalizePodCloneTargetRequest(t *testing.T) {
	target, reqErr := normalizePodCloneTargetRequest(validPodCloneTargetRequest(), true)
	if reqErr != nil {
		t.Fatalf("normalizePodCloneTargetRequest() error = %v", reqErr)
	}

	// A bare "172.30" normalizes to the trailing-dot form.
	if target.WANIPBase != "172.30." {
		t.Fatalf("WANIPBase = %q, want %q", target.WANIPBase, "172.30.")
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
		{"wan base with three octets", func(r *podCloneTargetRequest) { r.WANIPBase = "172.30.5" }, true},
		{"user pattern without placeholder", func(r *podCloneTargetRequest) {
			r.CloudInitUserFilePattern = "lab2-router-user-data.yaml"
		}, true},
		{"network file with placeholder", func(r *podCloneTargetRequest) {
			r.CloudInitNetworkFile = "lab2-router-{network}-network-config.yaml"
		}, true},
		{"snippet path traversal", func(r *podCloneTargetRequest) {
			r.LANDMZNetworkFile = "../lab2-network-config.yaml"
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
