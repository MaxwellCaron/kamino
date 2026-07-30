package main

import (
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/MaxwellCaron/kamino/internal/podnetwork"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
)

// Config holds all application configuration

var sharedVNetIDPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9]*$`)

const proxmoxVNetIDMaxLength = 8

func validateSharedVNetID(envVar, id string) error {
	if id == "" {
		return fmt.Errorf("%s must not be empty", envVar)
	}
	if len(id) > proxmoxVNetIDMaxLength {
		return fmt.Errorf("%s must be at most %d characters", envVar, proxmoxVNetIDMaxLength)
	}
	if !sharedVNetIDPattern.MatchString(id) {
		return fmt.Errorf("%s must start with a letter and contain only letters and numbers", envVar)
	}
	return nil
}

func rangesOverlap(leftMin, leftMax, rightMin, rightMax int32) bool {
	return leftMin <= rightMax && rightMin <= leftMax
}

func buildPodRouterCloneConfig(config *Config) (handlers.PodRouterCloneConfig, error) {
	lanVNet := strings.TrimSpace(config.PodLANVNet)
	if err := validateSharedVNetID("POD_LAN_VNET", lanVNet); err != nil {
		return handlers.PodRouterCloneConfig{}, err
	}
	dmzVNet := strings.TrimSpace(config.PodDMZVNet)
	if err := validateSharedVNetID("POD_DMZ_VNET", dmzVNet); err != nil {
		return handlers.PodRouterCloneConfig{}, err
	}
	personalVNet := strings.TrimSpace(config.PersonalPodVNet)
	if err := validateSharedVNetID("PERSONAL_POD_VNET", personalVNet); err != nil {
		return handlers.PodRouterCloneConfig{}, err
	}
	if lanVNet == dmzVNet {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_LAN_VNET and POD_DMZ_VNET must be distinct")
	}
	if lanVNet == personalVNet {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_LAN_VNET and PERSONAL_POD_VNET must be distinct")
	}
	if dmzVNet == personalVNet {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("POD_DMZ_VNET and PERSONAL_POD_VNET must be distinct")
	}

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
	if config.PersonalPodNetworkMin < 1 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_NETWORK_MIN must be at least 1")
	}
	if config.PersonalPodNetworkMax > 254 {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_NETWORK_MAX must be at most 254")
	}
	if config.PersonalPodNetworkMin > config.PersonalPodNetworkMax {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_NETWORK_MIN must be less than or equal to PERSONAL_POD_NETWORK_MAX")
	}

	personalWANBridge := strings.TrimSpace(config.PersonalPodWANBridge)
	if config.PersonalPodsEnabled && personalWANBridge == "" {
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_WAN_BRIDGE must not be empty when PERSONAL_PODS_ENABLED is true")
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

	routerConfig := handlers.PodRouterCloneConfig{
		LANVNet:                          lanVNet,
		DMZVNet:                          dmzVNet,
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
		PersonalVNet:                     personalVNet,
		PersonalNetworkMin:               config.PersonalPodNetworkMin,
		PersonalNetworkMax:               config.PersonalPodNetworkMax,
		PersonalWANBridge:                personalWANBridge,
		PersonalWANIPBase:                personalWANBase,
		PersonalCloudInitUserFilePattern: personalCloudInitUserFilePattern,
	}

	log.Printf(
		"Published pod clone networking configured: lan_vnet=%q dmz_vnet=%q personal_vnet=%q clone_range=%d-%d dev_range=%d-%d personal_range=%d-%d personal_wan_bridge=%q wait_timeout=%s cloud_init_storage=%q internal_subnet=%s",
		routerConfig.LANVNet,
		routerConfig.DMZVNet,
		routerConfig.PersonalVNet,
		routerConfig.NetworkMin,
		routerConfig.NetworkMax,
		routerConfig.DevNetworkMin,
		routerConfig.DevNetworkMax,
		routerConfig.PersonalNetworkMin,
		routerConfig.PersonalNetworkMax,
		routerConfig.PersonalWANBridge,
		routerConfig.RouterWaitTimeout,
		routerConfig.CloudInitStorage,
		routerConfig.InternalSubnet,
	)

	return routerConfig, nil
}

func buildPodNetworkCatalog(config handlers.PodRouterCloneConfig) (*podnetwork.Catalog, error) {
	return podnetwork.NewCatalog(podnetwork.Config{
		LANVNet:   config.LANVNet,
		DMZVNet:   config.DMZVNet,
		WANIPBase: config.WANIPBase,
	})
}
