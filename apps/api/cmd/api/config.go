package main

import (
	"strings"

	"github.com/google/uuid"
)

// Config holds all application configuration

type Config struct {
	// --- Core (required) ---
	Port              string   `envconfig:"PORT" default:":8080"`
	FrontendURL       string   `envconfig:"FRONTEND_URL" default:"http://localhost:3000"`
	TrustedProxyCIDRs []string `envconfig:"TRUSTED_PROXY_CIDRS"`
	DatabaseURL       string   `envconfig:"DATABASE_URL" required:"true"`
	JWTSecret         string   `envconfig:"JWT_SECRET" required:"true"`

	// --- Proxmox (required) ---
	ProxmoxURL                string `envconfig:"PROXMOX_URL" required:"true"`
	ProxmoxTokenID            string `envconfig:"PROXMOX_TOKEN_ID" required:"true"`
	ProxmoxTokenSecret        string `envconfig:"PROXMOX_TOKEN_SECRET" required:"true"`
	ProxmoxInsecure           bool   `envconfig:"PROXMOX_INSECURE" default:"false"`
	ProxmoxNodes              string `envconfig:"PROXMOX_NODES" required:"true"`
	ProxmoxSharedStorageNames string `envconfig:"PROXMOX_SHARED_STORAGE_NAMES"`
	ProxmoxInitialSyncEnabled bool   `envconfig:"PROXMOX_INITIAL_SYNC_ENABLED" default:"true"`

	// --- Principal provider (required) ---
	PrincipalProvider            string `envconfig:"PRINCIPAL_PROVIDER" required:"true"`
	PrincipalInitialSyncEnabled  bool   `envconfig:"PRINCIPAL_INITIAL_SYNC_ENABLED" default:"true"`
	PrincipalBootstrapAdminGroup string `envconfig:"PRINCIPAL_BOOTSTRAP_ADMIN_GROUP"`
	ProxmoxAuthRealm             string `envconfig:"PROXMOX_AUTH_REALM" default:"pve"`
	ProxmoxManagedUserRealm      string `envconfig:"PROXMOX_MANAGED_USER_REALM"`

	// --- Active Directory / LDAP (required when PRINCIPAL_PROVIDER=active_directory) ---
	LDAPUrl          string `envconfig:"LDAP_URL"`
	LDAPBindDN       string `envconfig:"LDAP_BIND_DN"`
	LDAPBindPassword string `envconfig:"LDAP_BIND_PASSWORD"`
	LDAPSearchBaseDN string `envconfig:"LDAP_SEARCH_BASE_DN"`
	LDAPUserOU       string `envconfig:"LDAP_USER_OU"`
	LDAPGroupOU      string `envconfig:"LDAP_GROUP_OU"`
	LDAPInsecure     bool   `envconfig:"LDAP_INSECURE" default:"false"`

	// --- Inventory folder item IDs (optional) ---
	TemplatesFolderItemID    string `envconfig:"TEMPLATES_FOLDER_ITEM_ID"`
	PodsFolderItemID         string `envconfig:"PODS_FOLDER_ITEM_ID"`
	PersonalPodsFolderItemID string `envconfig:"PERSONAL_PODS_FOLDER_ITEM_ID"`
	PodRouterTemplate        string `envconfig:"POD_ROUTER_TEMPLATE_ITEM_ID"`

	// --- Pod clone networking (optional defaults shown) ---
	PodCloneVNetPrefix                  string `envconfig:"POD_CLONE_VNET_PREFIX" default:"pod"`
	PodLANVLANBase                      int    `envconfig:"POD_LAN_VLAN_BASE" default:"0"`
	PodCloneNetworkMin                  int32  `envconfig:"POD_CLONE_NETWORK_MIN" default:"1"`
	PodCloneNetworkMax                  int32  `envconfig:"POD_CLONE_NETWORK_MAX" default:"174"`
	PodDevNetworkMin                    int32  `envconfig:"POD_DEV_NETWORK_MIN" default:"175"`
	PodDevNetworkMax                    int32  `envconfig:"POD_DEV_NETWORK_MAX" default:"199"`
	PodRouterWait                       string `envconfig:"POD_ROUTER_WAIT_TIMEOUT" default:"5m"`
	PodRouterWANIPBase                  string `envconfig:"POD_ROUTER_WAN_IP_BASE" default:"172.16."`
	PodRouterInternalSubnet             string `envconfig:"POD_ROUTER_INTERNAL_SUBNET" default:"192.168.1.0/24"`
	PodRouterCloudInitStorage           string `envconfig:"POD_ROUTER_CLOUD_INIT_STORAGE" default:"local"`
	PodRouterCloudInitUserFilePattern   string `envconfig:"POD_ROUTER_CLOUD_INIT_USER_FILE_PATTERN" default:"kamino-router-{network}-user-data.yaml"`
	PodRouterCloudInitNetworkFile       string `envconfig:"POD_ROUTER_CLOUD_INIT_NETWORK_FILE" default:"kamino-router-network-config.yaml"`
	PodDMZVNetPrefix                    string `envconfig:"POD_DMZ_VNET_PREFIX" default:"dmz"`
	PodDMZVLANBase                      int    `envconfig:"POD_DMZ_VLAN_BASE" default:"1000"`
	PodRouterLANDMZCloudInitUserPattern string `envconfig:"POD_ROUTER_LAN_DMZ_CLOUD_INIT_USER_FILE_PATTERN" default:"kamino-router-lan-dmz-{network}-user-data.yaml"`
	PodRouterLANDMZCloudInitNetworkFile string `envconfig:"POD_ROUTER_LAN_DMZ_CLOUD_INIT_NETWORK_FILE" default:"kamino-router-lan-dmz-network-config.yaml"`

	// --- Personal pods (optional; PERSONAL_POD_ROUTER_TEMPLATE_ITEM_ID gates the feature) ---
	PersonalPodRouterTemplateItemID     string `envconfig:"PERSONAL_POD_ROUTER_TEMPLATE_ITEM_ID"`
	PersonalPodVNetPrefix               string `envconfig:"PERSONAL_POD_VNET_PREFIX" default:"pod"`
	PersonalPodNetworkMin               int32  `envconfig:"PERSONAL_POD_NETWORK_MIN" default:"200"`
	PersonalPodNetworkMax               int32  `envconfig:"PERSONAL_POD_NETWORK_MAX" default:"254"`
	PersonalPodWANIPBase                string `envconfig:"PERSONAL_POD_WAN_IP_BASE" default:"172.16."`
	PersonalPodCloudInitUserFilePattern string `envconfig:"PERSONAL_POD_CLOUD_INIT_USER_FILE_PATTERN" default:"kamino-router-{network}-user-data.yaml"`

	// --- VMID allocation ranges (optional defaults shown) ---
	PodPublishVMIDMin  int `envconfig:"POD_PUBLISH_VMID_MIN" default:"1000"`
	PodPublishVMIDMax  int `envconfig:"POD_PUBLISH_VMID_MAX" default:"1999"`
	PodCloneVMIDMin    int `envconfig:"POD_CLONE_VMID_MIN" default:"2000"`
	PodCloneVMIDMax    int `envconfig:"POD_CLONE_VMID_MAX" default:"9999"`
	PodDevVMIDMin      int `envconfig:"POD_DEV_VMID_MIN" default:"10000"`
	PodDevVMIDMax      int `envconfig:"POD_DEV_VMID_MAX" default:"19999"`
	PersonalPodVMIDMin int `envconfig:"PERSONAL_POD_VMID_MIN" default:"20000"`
	PersonalPodVMIDMax int `envconfig:"PERSONAL_POD_VMID_MAX" default:"20999"`

	// --- VM concurrency (optional) ---
	VMOperationConcurrency int    `envconfig:"VM_OPERATION_CONCURRENCY" default:"2"`
	VMPowerConcurrency     int    `envconfig:"VM_POWER_CONCURRENCY" default:"6"`
	VMPowerTaskTimeout     string `envconfig:"VM_POWER_TASK_TIMEOUT" default:"5m"`
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func parseOptionalUUID(value string) (uuid.UUID, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return uuid.Nil, nil
	}

	id, err := uuid.Parse(trimmed)
	if err != nil {
		return uuid.Nil, err
	}

	return id, nil
}
