package main

import (
	"fmt"
	"log"

	"github.com/MaxwellCaron/kamino/internal/vmidalloc"
)

type vmidRanges struct {
	Publish  vmidalloc.Range
	Clone    vmidalloc.Range
	Dev      vmidalloc.Range
	Personal vmidalloc.Range
}

const (
	proxmoxVMIDLowerBound = 100
	proxmoxVMIDUpperBound = 999999999
)

func buildVMIDRangeConfig(config *Config) (vmidRanges, error) {
	ranges := vmidRanges{
		Publish:  vmidalloc.Range{Min: config.PodPublishVMIDMin, Max: config.PodPublishVMIDMax},
		Clone:    vmidalloc.Range{Min: config.PodCloneVMIDMin, Max: config.PodCloneVMIDMax},
		Dev:      vmidalloc.Range{Min: config.PodDevVMIDMin, Max: config.PodDevVMIDMax},
		Personal: vmidalloc.Range{Min: config.PersonalPodVMIDMin, Max: config.PersonalPodVMIDMax},
	}

	type namedRange struct {
		minVar string
		maxVar string
		r      vmidalloc.Range
	}
	named := []namedRange{
		{"POD_PUBLISH_VMID_MIN", "POD_PUBLISH_VMID_MAX", ranges.Publish},
		{"POD_CLONE_VMID_MIN", "POD_CLONE_VMID_MAX", ranges.Clone},
		{"POD_DEV_VMID_MIN", "POD_DEV_VMID_MAX", ranges.Dev},
		{"PERSONAL_POD_VMID_MIN", "PERSONAL_POD_VMID_MAX", ranges.Personal},
	}

	for _, nr := range named {
		if nr.r.Min < proxmoxVMIDLowerBound {
			return vmidRanges{}, fmt.Errorf("%s must be at least %d", nr.minVar, proxmoxVMIDLowerBound)
		}
		if nr.r.Max > proxmoxVMIDUpperBound {
			return vmidRanges{}, fmt.Errorf("%s must be at most %d", nr.maxVar, proxmoxVMIDUpperBound)
		}
		if nr.r.Min > nr.r.Max {
			return vmidRanges{}, fmt.Errorf("%s must be less than or equal to %s", nr.minVar, nr.maxVar)
		}
	}

	for index, a := range named {
		for _, b := range named[index+1:] {
			if a.r.Min <= b.r.Max && b.r.Min <= a.r.Max {
				return vmidRanges{}, fmt.Errorf(
					"%s..%s (%d–%d) must not overlap %s..%s (%d–%d)",
					a.minVar, a.maxVar, a.r.Min, a.r.Max,
					b.minVar, b.maxVar, b.r.Min, b.r.Max,
				)
			}
		}
	}

	log.Printf(
		"VMID ranges configured: publish=%d-%d clone=%d-%d dev=%d-%d personal=%d-%d",
		ranges.Publish.Min, ranges.Publish.Max,
		ranges.Clone.Min, ranges.Clone.Max,
		ranges.Dev.Min, ranges.Dev.Max,
		ranges.Personal.Min, ranges.Personal.Max,
	)

	return ranges, nil
}
