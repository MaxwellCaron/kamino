package proxmox

import (
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

func parseVMHardwareConfig(data map[string]any) (*VMHardwareConfig, error) {
	config := &VMHardwareConfig{
		OSType:  coalesceString(getStringValue(data["ostype"]), "l26"),
		BIOS:    coalesceString(getStringValue(data["bios"]), "seabios"),
		Machine: normalizeMachineHardwareValue(coalesceString(getStringValue(data["machine"]), "pc")),
		SCSI:    coalesceString(getStringValue(data["scsihw"]), "virtio-scsi-single"),
		Sockets: maxInt(getIntValue(data["sockets"]), 1),
		Cores:   maxInt(getIntValue(data["cores"]), 1),
		CPUType: coalesceString(getStringValue(data["cpu"]), "x86-64-v2-AES"),
		Memory:  mbToGB(getIntValue(data["memory"]), 1),
	}

	if balloonMB := getIntValue(data["balloon"]); balloonMB > 0 {
		config.Balloon = mbToGB(balloonMB, 0)
	}

	diskDevice, storage, diskSize, err := parseVMHardwareDiskConfig(data)
	if err != nil {
		return nil, err
	}
	config.DiskDevice = diskDevice
	config.Storage = storage
	config.DiskSize = diskSize

	networks := make([]VMHardwareNetwork, 0)
	for key, value := range data {
		if !strings.HasPrefix(key, "net") {
			continue
		}

		raw := getStringValue(value)
		if strings.TrimSpace(raw) == "" {
			continue
		}

		network, err := parseVMHardwareNetwork(key, raw)
		if err != nil {
			return nil, err
		}
		networks = append(networks, network)
	}

	slices.SortFunc(networks, func(left, right VMHardwareNetwork) int {
		return strings.Compare(left.Device, right.Device)
	})

	config.Networks = networks
	return config, nil
}

func parseVMIdentity(data map[string]any, vmid int) (*VMIdentity, error) {
	name := strings.TrimSpace(getStringValue(data["name"]))
	if name == "" {
		name = fmt.Sprintf("VM %d", vmid)
	}

	upstreamUUID, err := parseVMUpstreamUUID(getStringValue(data["smbios1"]))
	if err != nil {
		return nil, err
	}

	return &VMIdentity{
		Name:         name,
		IsTemplate:   getIntValue(data["template"]) == 1,
		UpstreamUUID: upstreamUUID,
	}, nil
}

func parseVMConfigSummary(data map[string]any, vmid int) (*VMConfigSummary, error) {
	identity, err := parseVMIdentity(data, vmid)
	if err != nil {
		return nil, err
	}

	sockets := maxInt(getIntValue(data["sockets"]), 1)
	cores := maxInt(getIntValue(data["cores"]), 1)
	memoryMB := maxInt(getIntValue(data["memory"]), 0)
	_, _, diskSizeGB, err := parseVMHardwareDiskConfig(data)
	if err != nil {
		return nil, err
	}

	return &VMConfigSummary{
		Name:         identity.Name,
		IsTemplate:   identity.IsTemplate,
		UpstreamUUID: identity.UpstreamUUID,
		CPUCount:     int32(sockets * cores),
		MemoryMB:     int32(memoryMB),
		DiskGB:       float64(diskSizeGB),
		Notes:        getStringValue(data["description"]),
	}, nil
}

func parseVMUpstreamUUID(raw string) (uuid.UUID, error) {
	segments := strings.Split(strings.TrimSpace(raw), ",")
	for _, segment := range segments {
		key, value, ok := strings.Cut(strings.TrimSpace(segment), "=")
		if !ok || key != "uuid" {
			continue
		}

		upstreamUUID, err := uuid.Parse(strings.TrimSpace(value))
		if err != nil {
			return uuid.Nil, fmt.Errorf("%w: %v", ErrVMIdentityInvalid, err)
		}

		return upstreamUUID, nil
	}

	return uuid.Nil, ErrVMIdentityNotConfigured
}

func withVMUpstreamUUID(raw string, upstreamUUID uuid.UUID) string {
	parts := make([]string, 0, 4)
	for _, segment := range strings.Split(strings.TrimSpace(raw), ",") {
		trimmed := strings.TrimSpace(segment)
		if trimmed == "" {
			continue
		}

		key, _, ok := strings.Cut(trimmed, "=")
		if ok && key == "uuid" {
			continue
		}

		parts = append(parts, trimmed)
	}

	parts = append(parts, "uuid="+upstreamUUID.String())
	return strings.Join(parts, ",")
}

func parseVMHardwareDiskConfig(data map[string]any) (string, string, int, error) {
	if bootDevice := parseBootDiskDevice(data); bootDevice != "" {
		if storage, sizeGB, err := parseVMHardwareDisk(bootDevice, getStringValue(data[bootDevice])); err == nil {
			return bootDevice, storage, sizeGB, nil
		}
	}

	diskDevices := collectEditableDiskDevices(data)
	for _, device := range diskDevices {
		storage, sizeGB, err := parseVMHardwareDisk(device, getStringValue(data[device]))
		if err == nil {
			return device, storage, sizeGB, nil
		}
	}

	return "", "", 0, fmt.Errorf("vm does not expose an editable primary disk")
}

func parseVMHardwareDisk(device, raw string) (string, int, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", 0, fmt.Errorf("%s is empty", device)
	}
	if !isEditableDiskValue(raw) {
		return "", 0, fmt.Errorf("%s is not an editable disk", device)
	}

	segments := strings.Split(raw, ",")
	location := strings.TrimSpace(segments[0])
	if location == "" {
		return "", 0, fmt.Errorf("invalid %s configuration", device)
	}

	locationParts := strings.SplitN(location, ":", 2)
	if len(locationParts) < 2 {
		return "", 0, fmt.Errorf("invalid %s storage target", device)
	}

	storage := strings.TrimSpace(locationParts[0])
	for _, segment := range segments[1:] {
		key, value, ok := strings.Cut(strings.TrimSpace(segment), "=")
		if !ok || key != "size" {
			continue
		}

		sizeGB, err := parseSizeToGB(value)
		if err != nil {
			return "", 0, err
		}
		return storage, sizeGB, nil
	}

	return "", 0, fmt.Errorf("%s size metadata is unavailable", device)
}

func parseVMHardwareNetwork(device, raw string) (VMHardwareNetwork, error) {
	parts := strings.Split(raw, ",")
	if len(parts) == 0 {
		return VMHardwareNetwork{}, fmt.Errorf("invalid %s configuration", device)
	}

	model, macAddress := parseNetworkModelAndMAC(parts[0])
	if model == "" {
		return VMHardwareNetwork{}, fmt.Errorf("invalid %s model", device)
	}

	network := VMHardwareNetwork{
		Device:     device,
		Model:      model,
		MACAddress: macAddress,
	}

	for _, part := range parts[1:] {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}

		switch key {
		case "bridge":
			network.Bridge = value
		case "tag":
			if vlanTag, err := strconv.Atoi(value); err == nil && vlanTag > 0 {
				network.VLANTag = &vlanTag
			}
		case "firewall":
			network.Firewall = value == "1" || strings.EqualFold(value, "true")
		case "link_down":
			network.LinkDown = value == "1" || strings.EqualFold(value, "true")
		}
	}

	return network, nil
}

func parseNetworkModelAndMAC(raw string) (string, string) {
	model, macAddress, hasMAC := strings.Cut(strings.TrimSpace(raw), "=")
	if !hasMAC {
		return model, ""
	}
	return model, strings.TrimSpace(macAddress)
}

func formatVMHardwareNetwork(network VMHardwareNetwork) string {
	model := strings.TrimSpace(network.Model)
	if model == "" {
		model = "virtio"
	}

	base := model
	if macAddress := strings.TrimSpace(network.MACAddress); macAddress != "" {
		base = fmt.Sprintf("%s=%s", model, macAddress)
	}

	parts := []string{base}
	if bridge := strings.TrimSpace(network.Bridge); bridge != "" {
		parts = append(parts, "bridge="+bridge)
	}
	if network.Firewall {
		parts = append(parts, "firewall=1")
	}
	if network.LinkDown {
		parts = append(parts, "link_down=1")
	}
	if network.VLANTag != nil && *network.VLANTag > 0 {
		parts = append(parts, fmt.Sprintf("tag=%d", *network.VLANTag))
	}

	return strings.Join(parts, ",")
}

func nextAvailableNetworkDevice(used map[string]struct{}, existing []VMHardwareNetwork) string {
	candidateUsed := make(map[string]struct{}, len(used)+len(existing))
	for key := range used {
		candidateUsed[key] = struct{}{}
	}
	for _, iface := range existing {
		candidateUsed[iface.Device] = struct{}{}
	}

	for index := 0; index < 10; index++ {
		device := fmt.Sprintf("net%d", index)
		if _, exists := used[device]; !exists {
			return device
		}
	}

	for index := 10; ; index++ {
		device := fmt.Sprintf("net%d", index)
		if _, exists := candidateUsed[device]; !exists {
			return device
		}
	}
}

func parseBootDiskDevice(data map[string]any) string {
	if device := strings.TrimSpace(getStringValue(data["bootdisk"])); isSupportedDiskDevice(device) {
		return device
	}

	boot := strings.TrimSpace(getStringValue(data["boot"]))
	if boot == "" {
		return ""
	}

	if _, order, ok := strings.Cut(boot, "order="); ok {
		for _, device := range strings.Split(order, ";") {
			trimmed := strings.TrimSpace(device)
			if isSupportedDiskDevice(trimmed) {
				return trimmed
			}
		}
	}

	return ""
}

func collectEditableDiskDevices(data map[string]any) []string {
	devices := make([]string, 0)
	for key, value := range data {
		if !isSupportedDiskDevice(key) || !isEditableDiskValue(getStringValue(value)) {
			continue
		}
		devices = append(devices, key)
	}

	slices.SortFunc(devices, compareDiskDevices)
	return devices
}

func compareDiskDevices(left, right string) int {
	leftRank, leftIndex := diskDeviceRank(left)
	rightRank, rightIndex := diskDeviceRank(right)

	if leftRank != rightRank {
		return leftRank - rightRank
	}
	if leftIndex != rightIndex {
		return leftIndex - rightIndex
	}
	return strings.Compare(left, right)
}

func diskDeviceRank(device string) (int, int) {
	switch {
	case strings.HasPrefix(device, "scsi"):
		return 0, parseDiskDeviceIndex(device, "scsi")
	case strings.HasPrefix(device, "virtio"):
		return 1, parseDiskDeviceIndex(device, "virtio")
	case strings.HasPrefix(device, "sata"):
		return 2, parseDiskDeviceIndex(device, "sata")
	case strings.HasPrefix(device, "ide"):
		return 3, parseDiskDeviceIndex(device, "ide")
	default:
		return 99, 99
	}
}

func parseDiskDeviceIndex(device, prefix string) int {
	value, err := strconv.Atoi(strings.TrimPrefix(device, prefix))
	if err != nil {
		return 99
	}
	return value
}

func isSupportedDiskDevice(device string) bool {
	switch {
	case strings.HasPrefix(device, "scsi"),
		strings.HasPrefix(device, "virtio"),
		strings.HasPrefix(device, "sata"),
		strings.HasPrefix(device, "ide"):
		return true
	default:
		return false
	}
}

func isEditableDiskValue(raw string) bool {
	trimmed := strings.TrimSpace(strings.ToLower(raw))
	if trimmed == "" {
		return false
	}
	if strings.Contains(trimmed, "media=cdrom") || strings.Contains(trimmed, "cloudinit") {
		return false
	}
	return strings.Contains(trimmed, "size=")
}

func normalizeMachineHardwareValue(machine string) string {
	switch trimmed := strings.TrimSpace(machine); {
	case trimmed == "", trimmed == "i440fx", trimmed == "pc", strings.HasPrefix(trimmed, "pc-"):
		return "pc"
	case strings.HasPrefix(trimmed, "q35"):
		return "q35"
	default:
		return trimmed
	}
}

func coalesceString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func getStringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	default:
		return ""
	}
}

func getIntValue(value any) int {
	switch typed := value.(type) {
	case float64:
		return int(math.Round(typed))
	case int:
		return typed
	case int32:
		return int(typed)
	case int64:
		return int(typed)
	case json.Number:
		parsed, _ := typed.Int64()
		return int(parsed)
	case string:
		parsed, _ := strconv.Atoi(strings.TrimSpace(typed))
		return parsed
	default:
		return 0
	}
}

func mbToGB(valueMB int, fallback int) int {
	if valueMB <= 0 {
		return fallback
	}
	return int(math.Ceil(float64(valueMB) / 1024))
}

func parseSizeToGB(raw string) (int, error) {
	trimmed := strings.TrimSpace(strings.ToUpper(raw))
	if trimmed == "" {
		return 0, fmt.Errorf("disk size is required")
	}

	unit := trimmed[len(trimmed)-1]
	multiplier := 1.0
	valueString := trimmed

	switch unit {
	case 'K':
		multiplier = 1.0 / (1024 * 1024)
		valueString = trimmed[:len(trimmed)-1]
	case 'M':
		multiplier = 1.0 / 1024
		valueString = trimmed[:len(trimmed)-1]
	case 'G':
		multiplier = 1
		valueString = trimmed[:len(trimmed)-1]
	case 'T':
		multiplier = 1024
		valueString = trimmed[:len(trimmed)-1]
	default:
		// Proxmox writes size= in raw bytes when the value is not an even
		// multiple of K/M/G/T.
		multiplier = 1.0 / (1024 * 1024 * 1024)
	}

	value, err := strconv.ParseFloat(valueString, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid disk size %q", raw)
	}
	return int(math.Ceil(value * multiplier)), nil
}

func maxInt(value, fallback int) int {
	if value <= 0 {
		return fallback
	}
	return value
}
