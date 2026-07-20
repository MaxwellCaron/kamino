package main

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
)

// Config holds all application configuration

const proxmoxVNetIDMaxLength = 8

func rangesOverlap(leftMin, leftMax, rightMin, rightMax int32) bool {
	return leftMin <= rightMax && rightMin <= leftMax
}

func buildPodRouterCloneConfig(config *Config) (handlers.PodRouterCloneConfig, error) {
	vnetPrefix := strings.TrimSpace(config.PodCloneVNetPrefix)
	if config.PodCloneNetworkMin < 1 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_CLONE_NETWORK_MIN must be at least 1")
	}
	if config.PodCloneNetworkMax > 254 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_CLONE_NETWORK_MAX must be at most 254")
	}
	if config.PodCloneNetworkMin > config.PodCloneNetworkMax {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_CLONE_NETWORK_MIN must be less than or equal to POD_CLONE_NETWORK_MAX")
	}
	if config.PodDevNetworkMin < 1 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_DEV_NETWORK_MIN must be at least 1")
	}
	if config.PodDevNetworkMax > 254 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_DEV_NETWORK_MAX must be at most 254")
	}
	if config.PodDevNetworkMin > config.PodDevNetworkMax {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_DEV_NETWORK_MIN must be less than or equal to POD_DEV_NETWORK_MAX")
	}
	if rangesOverlap(
		config.PodCloneNetworkMin,
		config.PodCloneNetworkMax,
		config.PodDevNetworkMin,
		config.PodDevNetworkMax,
	) {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_CLONE_NETWORK_MIN..POD_CLONE_NETWORK_MAX must not overlap POD_DEV_NETWORK_MIN..POD_DEV_NETWORK_MAX")
	}
	minNetworkNumber := config.PodCloneNetworkMin
	if config.PodDevNetworkMin < minNetworkNumber {
		minNetworkNumber = config.PodDevNetworkMin
	}
	maxNetworkNumber := config.PodCloneNetworkMax
	if config.PodDevNetworkMax > maxNetworkNumber {
		maxNetworkNumber = config.PodDevNetworkMax
	}
	if config.PersonalPodNetworkMin < 1 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_NETWORK_MIN must be at least 1")
	}
	if config.PersonalPodNetworkMax > 254 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_NETWORK_MAX must be at most 254")
	}
	if config.PersonalPodNetworkMin > config.PersonalPodNetworkMax {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_NETWORK_MIN must be less than or equal to PERSONAL_POD_NETWORK_MAX")
	}

	personalPrefix := strings.TrimSpace(config.PersonalPodVNetPrefix)
	if personalPrefix == "" {
		personalPrefix = vnetPrefix
	}
	personalWANBase := strings.TrimSpace(config.PersonalPodWANIPBase)
	if personalWANBase == "" {
		personalWANBase = config.PodRouterWANIPBase
	}
	personalPattern := strings.TrimSpace(config.PersonalPodCloudInitUserFilePattern)
	if personalPattern == "" {
		personalPattern = config.PodRouterCloudInitUserFilePattern
	}

	waitTimeout, err := time.ParseDuration(strings.TrimSpace(config.PodRouterWait))
	if err != nil {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("invalid POD_ROUTER_WAIT_TIMEOUT: %w", err)
	}
	if waitTimeout <= 0 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_ROUTER_WAIT_TIMEOUT must be positive")
	}

	wanIPBase, err := routerconfig.NormalizeDottedPrefix(config.PodRouterWANIPBase)
	if err != nil {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("invalid POD_ROUTER_WAN_IP_BASE: %w", err)
	}
	if wanIPBase == "" {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_ROUTER_WAN_IP_BASE must not be empty")
	}
	internalSubnet, err := routerconfig.ParseIPv4Subnet24(config.PodRouterInternalSubnet)
	if err != nil {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("invalid POD_ROUTER_INTERNAL_SUBNET: %w", err)
	}
	cloudInitStorage := routerconfig.NormalizeCloudInitStorage(config.PodRouterCloudInitStorage)
	if cloudInitStorage == "" {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_ROUTER_CLOUD_INIT_STORAGE must not be empty")
	}
	cloudInitUserFilePattern, err := routerconfig.NormalizeCloudInitFilePattern(
		"POD_ROUTER_CLOUD_INIT_USER_FILE_PATTERN",
		config.PodRouterCloudInitUserFilePattern,
	)
	if err != nil {
		return handlers.PodRouterCloneConfig{}, err
	}
	personalWANBase, err = routerconfig.NormalizeDottedPrefix(personalWANBase)
	if err != nil {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("invalid PERSONAL_POD_WAN_IP_BASE: %w", err)
	}
	if personalWANBase == "" {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_WAN_IP_BASE must not be empty")
	}
	personalCloudInitUserFilePattern, err := routerconfig.NormalizeCloudInitFilePattern(
		"PERSONAL_POD_CLOUD_INIT_USER_FILE_PATTERN",
		personalPattern,
	)
	if err != nil {
		return handlers.PodRouterCloneConfig{}, err
	}
	cloudInitNetworkFile, err := routerconfig.NormalizeCloudInitFileName(
		"POD_ROUTER_CLOUD_INIT_NETWORK_FILE",
		config.PodRouterCloudInitNetworkFile,
	)
	if err != nil {
		return handlers.PodRouterCloneConfig{}, err
	}
	if personalCloudInitUserFilePattern == cloudInitUserFilePattern &&
		(rangesOverlap(
			config.PersonalPodNetworkMin,
			config.PersonalPodNetworkMax,
			config.PodCloneNetworkMin,
			config.PodCloneNetworkMax,
		) ||
			rangesOverlap(
				config.PersonalPodNetworkMin,
				config.PersonalPodNetworkMax,
				config.PodDevNetworkMin,
				config.PodDevNetworkMax,
			)) {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_NETWORK_MIN..PERSONAL_POD_NETWORK_MAX must not overlap pod ranges when the cloud-init user file pattern is shared")
	}

	dmzVNetPrefix := strings.TrimSpace(config.PodDMZVNetPrefix)
	if dmzVNetPrefix == "" {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_DMZ_VNET_PREFIX must not be empty")
	}
	if config.PodDMZVLANBase < 0 || config.PodDMZVLANBase > 4094 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_DMZ_VLAN_BASE must be within 0..4094")
	}
	if config.PodLANVLANBase < 0 || config.PodLANVLANBase > 4094 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_LAN_VLAN_BASE must be within 0..4094")
	}
	if config.PersonalPodVLANBase < 0 || config.PersonalPodVLANBase > 4094 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_VLAN_BASE must be within 0..4094")
	}
	lanDMZCloudInitUserFilePattern, err := routerconfig.NormalizeCloudInitFilePattern(
		"POD_ROUTER_LAN_DMZ_CLOUD_INIT_USER_FILE_PATTERN",
		config.PodRouterLANDMZCloudInitUserPattern,
	)
	if err != nil {
		return handlers.PodRouterCloneConfig{}, err
	}
	lanDMZCloudInitNetworkFile, err := routerconfig.NormalizeCloudInitFileName(
		"POD_ROUTER_LAN_DMZ_CLOUD_INIT_NETWORK_FILE",
		config.PodRouterLANDMZCloudInitNetworkFile,
	)
	if err != nil {
		return handlers.PodRouterCloneConfig{}, err
	}

	lanMinTag := config.PodLANVLANBase + int(minNetworkNumber)
	lanMaxTag := config.PodLANVLANBase + int(maxNetworkNumber)
	dmzMinTag := config.PodDMZVLANBase + int(minNetworkNumber)
	dmzMaxTag := config.PodDMZVLANBase + int(maxNetworkNumber)
	personalMinTag := config.PersonalPodVLANBase + int(config.PersonalPodNetworkMin)
	personalMaxTag := config.PersonalPodVLANBase + int(config.PersonalPodNetworkMax)
	if lanMinTag < 1 || lanMaxTag > 4094 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("derived LAN VLAN tags must be within 1..4094")
	}
	if dmzMinTag < 1 || dmzMaxTag > 4094 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("derived DMZ VLAN tags must be within 1..4094")
	}
	if personalMinTag < 1 || personalMaxTag > 4094 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("derived personal pod VLAN tags must be within 1..4094")
	}
	if rangesOverlap(int32(lanMinTag), int32(lanMaxTag), int32(dmzMinTag), int32(dmzMaxTag)) {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("LAN and DMZ VLAN tag ranges must not overlap")
	}
	if rangesOverlap(int32(personalMinTag), int32(personalMaxTag), int32(lanMinTag), int32(lanMaxTag)) {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("personal pod and LAN VLAN tag ranges must not overlap")
	}
	if rangesOverlap(int32(personalMinTag), int32(personalMaxTag), int32(dmzMinTag), int32(dmzMaxTag)) {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("personal pod and DMZ VLAN tag ranges must not overlap")
	}
	if len(fmt.Sprintf("%s%d", vnetPrefix, config.PodLANVLANBase+int(maxNetworkNumber))) > proxmoxVNetIDMaxLength {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("derived LAN VNet IDs must be at most %d characters", proxmoxVNetIDMaxLength)
	}
	if len(fmt.Sprintf("%s%d", dmzVNetPrefix, config.PodDMZVLANBase+int(maxNetworkNumber))) > proxmoxVNetIDMaxLength {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("derived DMZ VNet IDs must be at most %d characters", proxmoxVNetIDMaxLength)
	}
	if len(fmt.Sprintf("%s%d", personalPrefix, personalMaxTag)) > proxmoxVNetIDMaxLength {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("derived personal pod VNet IDs must be at most %d characters", proxmoxVNetIDMaxLength)
	}

	routerConfig := handlers.PodRouterCloneConfig{
		VNetPrefix:                       vnetPrefix,
		LANVLANBase:                      config.PodLANVLANBase,
		DMZVNetPrefix:                    dmzVNetPrefix,
		DMZVLANBase:                      config.PodDMZVLANBase,
		NetworkMin:                       config.PodCloneNetworkMin,
		NetworkMax:                       config.PodCloneNetworkMax,
		DevNetworkMin:                    config.PodDevNetworkMin,
		DevNetworkMax:                    config.PodDevNetworkMax,
		RouterWaitTimeout:                waitTimeout,
		WANIPBase:                        wanIPBase,
		InternalSubnet:                   internalSubnet,
		CloudInitStorage:                 cloudInitStorage,
		CloudInitUserFilePattern:         cloudInitUserFilePattern,
		CloudInitNetworkFile:             cloudInitNetworkFile,
		LANDMZCloudInitUserFilePattern:   lanDMZCloudInitUserFilePattern,
		LANDMZCloudInitNetworkFile:       lanDMZCloudInitNetworkFile,
		PersonalVNetPrefix:               personalPrefix,
		PersonalVLANBase:                 config.PersonalPodVLANBase,
		PersonalNetworkMin:               config.PersonalPodNetworkMin,
		PersonalNetworkMax:               config.PersonalPodNetworkMax,
		PersonalWANIPBase:                personalWANBase,
		PersonalCloudInitUserFilePattern: personalCloudInitUserFilePattern,
	}

	log.Printf(
		"Published pod clone networking configured: prefix=%q clone_range=%d-%d dev_range=%d-%d personal_range=%d-%d personal_prefix=%q personal_vlan_base=%d wait_timeout=%s cloud_init_storage=%q internal_subnet=%s",
		routerConfig.VNetPrefix,
		routerConfig.NetworkMin,
		routerConfig.NetworkMax,
		routerConfig.DevNetworkMin,
		routerConfig.DevNetworkMax,
		routerConfig.PersonalNetworkMin,
		routerConfig.PersonalNetworkMax,
		routerConfig.PersonalVNetPrefix,
		routerConfig.PersonalVLANBase,
		routerConfig.RouterWaitTimeout,
		routerConfig.CloudInitStorage,
		routerConfig.InternalSubnet,
	)

	return routerConfig, nil
}

func buildPodNetworkCatalog(config handlers.PodRouterCloneConfig) (*podnetwork.Catalog, error) {
	return podnetwork.NewCatalog(podnetwork.Config{
		VNetPrefix:    config.VNetPrefix,
		LANVLANBase:   config.LANVLANBase,
		DMZVNetPrefix: config.DMZVNetPrefix,
		DMZVLANBase:   config.DMZVLANBase,
		WANIPBase:     config.WANIPBase,
	})
}
