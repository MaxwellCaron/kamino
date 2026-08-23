package proxmox

import (
	"context"
	"fmt"
	"slices"
	"strings"
)

func (c *Client) UpdateVMHardware(ctx context.Context, node string, vmid int, config VMHardwareConfig) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}

	current, err := c.GetVMHardwareConfig(ctx, node, vmid)
	if err != nil {
		return err
	}

	if config.Storage != current.Storage {
		return fmt.Errorf("changing disk storage is not supported yet")
	}
	if config.DiskSize < current.DiskSize {
		return fmt.Errorf("shrinking disks is not supported")
	}
	if len(config.Networks) == 0 {
		return fmt.Errorf("at least one network interface is required")
	}

	params := map[string]string{
		"ostype": config.OSType,
		"bios":   config.BIOS,
		"scsihw": config.SCSI,
		"cpu":    config.CPUType,
		"memory": fmt.Sprintf("%d", config.Memory*1024),
		"balloon": fmt.Sprintf("%d",
			config.Balloon*1024),
		"sockets": fmt.Sprintf("%d", config.Sockets),
		"cores":   fmt.Sprintf("%d", config.Cores),
	}

	if normalizedMachine := normalizeMachineHardwareValue(config.Machine); normalizedMachine != "" {
		params["machine"] = normalizedMachine
	}

	usedDevices := make(map[string]struct{}, len(config.Networks))
	for _, iface := range config.Networks {
		device := strings.TrimSpace(iface.Device)
		if device == "" {
			device = nextAvailableNetworkDevice(usedDevices, current.Networks)
		}
		usedDevices[device] = struct{}{}
		params[device] = formatVMHardwareNetwork(iface)
	}

	deleteDevices := make([]string, 0, len(current.Networks))
	for _, iface := range current.Networks {
		if _, exists := usedDevices[iface.Device]; !exists {
			deleteDevices = append(deleteDevices, iface.Device)
		}
	}
	if len(deleteDevices) > 0 {
		slices.Sort(deleteDevices)
		params["delete"] = strings.Join(deleteDevices, ",")
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/config", node, vmid)
	if err := c.put(ctx, path, params, nil); err != nil {
		return fmt.Errorf("updating VM hardware: %w", err)
	}

	if config.DiskSize > current.DiskSize {
		if err := c.ResizeVMDisk(ctx, node, vmid, current.DiskDevice, config.DiskSize-current.DiskSize); err != nil {
			return err
		}
	}

	return nil
}

// ResizeVMDisk increases the size of a VM disk by the requested number of GB.
func (c *Client) ResizeVMDisk(ctx context.Context, node string, vmid int, disk string, deltaGB int) error {
	if err := c.requireAllowedNode(node); err != nil {
		return err
	}
	if deltaGB <= 0 {
		return nil
	}

	path := fmt.Sprintf("/api2/json/nodes/%s/qemu/%d/resize", node, vmid)
	form := map[string]string{
		"disk": disk,
		"size": fmt.Sprintf("+%dG", deltaGB),
	}

	var resp apiResponse[string]
	if err := c.put(ctx, path, form, &resp); err != nil {
		return fmt.Errorf("resizing VM disk: %w", err)
	}
	return c.waitForTask(ctx, node, resp.Data)
}
