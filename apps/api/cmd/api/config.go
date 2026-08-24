package main

import (
	"errors"
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
	ProxmoxSPICEProxyHost     string `envconfig:"PROXMOX_SPICE_PROXY_HOST"`
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
	VMTemplatesFolderItemID  string `envconfig:"VM_TEMPLATES_FOLDER_ITEM_ID"`
	PodsFolderItemID         string `envconfig:"PODS_FOLDER_ITEM_ID"`
	PersonalPodsFolderItemID string `envconfig:"PERSONAL_PODS_FOLDER_ITEM_ID"`
	PodRouterTemplate        string `envconfig:"POD_ROUTER_TEMPLATE_ITEM_ID"`

	// --- Pod clone operations ---
	PodRouterWait string `envconfig:"POD_ROUTER_WAIT_TIMEOUT" default:"5m"`

	// --- Personal pods (optional; defaults to the pod router template) ---
	PersonalPodsEnabled             bool   `envconfig:"PERSONAL_PODS_ENABLED" default:"false"`
	PersonalPodRouterTemplateItemID string `envconfig:"PERSONAL_POD_ROUTER_TEMPLATE_ITEM_ID"`

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

	// --- OpenTelemetry (optional) ---
	OTelEnabled           bool    `envconfig:"OTEL_ENABLED" default:"false"`
	OTelExporterEndpoint  string  `envconfig:"OTEL_EXPORTER_OTLP_ENDPOINT"`
	OTelTraceSampleRatio  float64 `envconfig:"OTEL_TRACE_SAMPLE_RATIO" default:"1"`
	DeploymentEnvironment string  `envconfig:"DEPLOYMENT_ENVIRONMENT" default:"local"`
	OTelK8sClusterName    string  `envconfig:"OTEL_K8S_CLUSTER_NAME"`
	K8sNamespace          string  `envconfig:"K8S_NAMESPACE"`
	K8sPodName            string  `envconfig:"K8S_POD_NAME"`
	K8sPodUID             string  `envconfig:"K8S_POD_UID"`
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

func resolvePersonalPodRouterTemplateItemID(enabled bool, value string, podRouterTemplateItemID uuid.UUID) (uuid.UUID, error) {
	templateItemID := podRouterTemplateItemID
	if strings.TrimSpace(value) != "" {
		var err error
		templateItemID, err = parseOptionalUUID(value)
		if err != nil {
			return uuid.Nil, err
		}
	}

	if enabled && templateItemID == uuid.Nil {
		return uuid.Nil, errors.New("PERSONAL_PODS_ENABLED requires POD_ROUTER_TEMPLATE_ITEM_ID or PERSONAL_POD_ROUTER_TEMPLATE_ITEM_ID")
	}

	return templateItemID, nil
}

// resolveVMTemplatesFolderItemID inherits templatesFolderItemID when value is blank.
func resolveVMTemplatesFolderItemID(value string, templatesFolderItemID uuid.UUID) (uuid.UUID, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return templatesFolderItemID, nil
	}
	return uuid.Parse(trimmed)
}
