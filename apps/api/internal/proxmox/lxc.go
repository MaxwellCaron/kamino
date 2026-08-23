package proxmox

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

var lxcUUIDNamespace = uuid.MustParse("a2f6a4d8-3c5e-4b0f-9a37-5b2d94e60c11")

func lxcUpstreamUUID(vmid int) uuid.UUID {
	return uuid.NewSHA1(lxcUUIDNamespace, fmt.Appendf(nil, "lxc/%d", vmid))
}

func parseLXCConfigSummary(data map[string]any, vmid int) (*VMConfigSummary, error) {
	name := strings.TrimSpace(getStringValue(data["hostname"]))
	if name == "" {
		name = fmt.Sprintf("CT %d", vmid)
	}

	cores := maxInt(getIntValue(data["cores"]), 1)
	memoryMB := maxInt(getIntValue(data["memory"]), 0)

	diskGB := 0.0
	if rootfs := strings.TrimSpace(getStringValue(data["rootfs"])); rootfs != "" {
		sizeGB, err := parseLXCRootfsSizeGB(rootfs)
		if err != nil {
			return nil, err
		}
		diskGB = float64(sizeGB)
	}

	return &VMConfigSummary{
		Name:         name,
		IsTemplate:   getIntValue(data["template"]) == 1,
		UpstreamUUID: lxcUpstreamUUID(vmid),
		CPUCount:     int32(cores),
		MemoryMB:     int32(memoryMB),
		DiskGB:       diskGB,
		Notes:        getStringValue(data["description"]),
	}, nil
}

func parseLXCRootfsSizeGB(raw string) (int, error) {
	for _, segment := range strings.Split(raw, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(segment), "=")
		if !ok || key != "size" {
			continue
		}
		return parseSizeToGB(value)
	}
	return 0, fmt.Errorf("rootfs size metadata is unavailable")
}

func parseLXCNetworks(data map[string]any) ([]VMHardwareNetwork, error) {
	networks := make([]VMHardwareNetwork, 0)
	for key, value := range data {
		if !strings.HasPrefix(key, "net") {
			continue
		}

		raw := getStringValue(value)
		if strings.TrimSpace(raw) == "" {
			continue
		}

		network, err := parseLXCNetwork(key, raw)
		if err != nil {
			return nil, err
		}
		networks = append(networks, network)
	}

	slices.SortFunc(networks, func(left, right VMHardwareNetwork) int {
		return strings.Compare(left.Device, right.Device)
	})

	return networks, nil
}

func parseLXCNetwork(device, raw string) (VMHardwareNetwork, error) {
	parts := strings.Split(raw, ",")
	if len(parts) == 0 {
		return VMHardwareNetwork{}, fmt.Errorf("invalid %s configuration", device)
	}

	network := VMHardwareNetwork{
		Device: device,
		Model:  "veth",
	}

	for _, part := range parts {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}

		switch key {
		case "bridge":
			network.Bridge = strings.TrimSpace(value)
		case "hwaddr":
			network.MACAddress = strings.TrimSpace(value)
		case "tag":
			tag, err := strconv.Atoi(strings.TrimSpace(value))
			if err != nil {
				return VMHardwareNetwork{}, fmt.Errorf("invalid %s vlan tag", device)
			}
			network.VLANTag = &tag
		case "firewall":
			network.Firewall = strings.TrimSpace(value) == "1"
		}
	}

	return network, nil
}
