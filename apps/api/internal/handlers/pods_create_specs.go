package handlers

import (
	"fmt"
	"strings"

	"github.com/MaxwellCaron/kamino/internal/names"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/google/uuid"
)

func (h *PodsHandler) resolveCreateNetworkProfile(req createPodRequest) (string, bool, error) {
	profileKey := strings.TrimSpace(req.NetworkProfileKey)
	if profileKey == "" {
		return "", false, nil
	}
	if h.NetworkCatalog == nil {
		return "", false, fmt.Errorf("pod network catalog is not configured")
	}
	if _, err := h.NetworkCatalog.Profile(profileKey); err != nil {
		return "", false, err
	}
	return profileKey, true, nil
}

func segmentAssignmentsFromSpecs(specs []podCloneSpec) map[string]string {
	assignments := make(map[string]string, len(specs))
	for _, spec := range specs {
		if spec.Router {
			continue
		}
		assignments[spec.Name] = spec.SegmentKey
	}
	return assignments
}

func (h *PodsHandler) buildCloneSpecs(req createPodRequest) ([]podCloneSpec, error) {
	specs := make([]podCloneSpec, 0)

	profileKey, automatedNetworking, err := h.resolveCreateNetworkProfile(req)
	if err != nil {
		return nil, err
	}

	if automatedNetworking {
		if h.RouterTemplateItemID == uuid.Nil {
			return nil, fmt.Errorf("router template is not configured")
		}
		specs = append(specs, podCloneSpec{
			TemplateItemID: h.RouterTemplateItemID,
			Name:           "router",
			Router:         true,
		})
	}

	defaultSegment := ""
	if automatedNetworking {
		defaultSegment, err = h.NetworkCatalog.DefaultWorkloadSegment(profileKey)
		if err != nil {
			return nil, err
		}
	}

	for _, template := range req.Templates {
		templateID, err := uuid.Parse(template.TemplateItemID)
		if err != nil {
			return nil, fmt.Errorf("invalid template_item_id")
		}

		for _, vm := range template.VMs {
			name := names.Normalize(vm.Name)
			if err := names.ValidateVM(name); err != nil {
				return nil, err
			}
			if vm.CPUCount < 1 || vm.CPUCount > 8 {
				return nil, fmt.Errorf("CPU must be between 1 and 8 vCPU")
			}
			if vm.MemoryGB < 1 || vm.MemoryGB > 32 {
				return nil, fmt.Errorf("memory must be between 1 and 32 GB")
			}
			if vm.StorageGB < 10 || vm.StorageGB > 100 {
				return nil, fmt.Errorf("storage must be between 10 and 100 GB")
			}

			segmentKey := defaultSegment
			if vm.SegmentKey != nil {
				segmentKey = strings.TrimSpace(*vm.SegmentKey)
			}
			if !automatedNetworking && segmentKey != "" {
				return nil, fmt.Errorf("segment_key requires network_profile_key")
			}
			if automatedNetworking && profileKey == podnetwork.ProfileLANDMZRouterV1 && segmentKey == "" {
				return nil, fmt.Errorf("segment_key is required for every workload in the LAN + DMZ Router profile")
			}

			specs = append(specs, podCloneSpec{
				TemplateItemID: templateID,
				Name:           name,
				SegmentKey:     segmentKey,
				Hardware: &podCloneHardware{
					CPUCount:  vm.CPUCount,
					MemoryGB:  vm.MemoryGB,
					StorageGB: vm.StorageGB,
				},
			})
		}
	}

	return specs, nil
}
