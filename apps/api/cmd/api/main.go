package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/auth"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlers"
	"github.com/MaxwellCaron/kamino/internal/inventory"
	"github.com/MaxwellCaron/kamino/internal/middleware"
	"github.com/MaxwellCaron/kamino/internal/principals/activedirectory"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/MaxwellCaron/kamino/internal/proxmox/vmstatus"
	requestqueue "github.com/MaxwellCaron/kamino/internal/requests"
	"github.com/MaxwellCaron/kamino/internal/routerconfig"
	"github.com/MaxwellCaron/kamino/internal/routes"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/kelseyhightower/envconfig"
)

// Config holds all application configuration
type Config struct {
	// --- Core (required) ---
	Port        string `envconfig:"PORT" default:":8080"`
	FrontendURL string `envconfig:"FRONTEND_URL" default:"http://localhost:3000"`
	DatabaseURL string `envconfig:"DATABASE_URL" required:"true"`
	JWTSecret   string `envconfig:"JWT_SECRET" required:"true"`

	// --- Proxmox (required) ---
	ProxmoxURL         string `envconfig:"PROXMOX_URL" required:"true"`
	ProxmoxTokenID     string `envconfig:"PROXMOX_TOKEN_ID" required:"true"`
	ProxmoxTokenSecret string `envconfig:"PROXMOX_TOKEN_SECRET" required:"true"`
	ProxmoxInsecure    bool   `envconfig:"PROXMOX_INSECURE" default:"false"`
	ProxmoxNodes       string `envconfig:"PROXMOX_NODES" required:"true"`

	// --- Active Directory / LDAP (optional; all required if AD auth/sync is enabled) ---
	LDAPUrl          string `envconfig:"LDAP_URL"`
	LDAPBindDN       string `envconfig:"LDAP_BIND_DN"`
	LDAPBindPassword string `envconfig:"LDAP_BIND_PASSWORD"`
	LDAPSearchBaseDN string `envconfig:"LDAP_SEARCH_BASE_DN"`
	LDAPUserOU       string `envconfig:"LDAP_USER_OU"`
	LDAPGroupOU      string `envconfig:"LDAP_GROUP_OU"`
	LDAPAdminGroupDN string `envconfig:"LDAP_ADMIN_GROUP_DN"`
	LDAPInsecure     bool   `envconfig:"LDAP_INSECURE" default:"false"`

	// --- Inventory folder item IDs (optional) ---
	TemplatesFolderItemID    string `envconfig:"TEMPLATES_FOLDER_ITEM_ID"`
	PodsFolderItemID         string `envconfig:"PODS_FOLDER_ITEM_ID"`
	PersonalPodsFolderItemID string `envconfig:"PERSONAL_PODS_FOLDER_ITEM_ID"`
	PodRouterTemplate        string `envconfig:"POD_ROUTER_TEMPLATE_ITEM_ID"`

	// --- Pod clone networking (optional defaults shown) ---
	PodCloneVNetPrefix                string `envconfig:"POD_CLONE_VNET_PREFIX" default:"pod"`
	PodCloneNetworkMin                int32  `envconfig:"POD_CLONE_NETWORK_MIN" default:"1"`
	PodCloneNetworkMax                int32  `envconfig:"POD_CLONE_NETWORK_MAX" default:"174"`
	PodDevNetworkMin                  int32  `envconfig:"POD_DEV_NETWORK_MIN" default:"175"`
	PodDevNetworkMax                  int32  `envconfig:"POD_DEV_NETWORK_MAX" default:"199"`
	PodRouterWait                     string `envconfig:"POD_ROUTER_WAIT_TIMEOUT" default:"5m"`
	PodRouterWANIPBase                string `envconfig:"POD_ROUTER_WAN_IP_BASE" default:"172.16."`
	PodRouterInternalSubnet           string `envconfig:"POD_ROUTER_INTERNAL_SUBNET" default:"192.168.1.0/24"`
	PodRouterCloudInitStorage         string `envconfig:"POD_ROUTER_CLOUD_INIT_STORAGE" default:"local"`
	PodRouterCloudInitUserFilePattern string `envconfig:"POD_ROUTER_CLOUD_INIT_USER_FILE_PATTERN" default:"kamino-router-{network}-user-data.yaml"`
	PodRouterCloudInitNetworkFile     string `envconfig:"POD_ROUTER_CLOUD_INIT_NETWORK_FILE" default:"kamino-router-network-config.yaml"`

	// --- Personal pods (optional; PERSONAL_POD_ROUTER_TEMPLATE_ITEM_ID gates the feature) ---
	PersonalPodRouterTemplateItemID     string `envconfig:"PERSONAL_POD_ROUTER_TEMPLATE_ITEM_ID"`
	PersonalPodVNetPrefix               string `envconfig:"PERSONAL_POD_VNET_PREFIX" default:"pod"`
	PersonalPodNetworkMin               int32  `envconfig:"PERSONAL_POD_NETWORK_MIN" default:"200"`
	PersonalPodNetworkMax               int32  `envconfig:"PERSONAL_POD_NETWORK_MAX" default:"254"`
	PersonalPodWANIPBase                string `envconfig:"PERSONAL_POD_WAN_IP_BASE" default:"172.16."`
	PersonalPodCloudInitUserFilePattern string `envconfig:"PERSONAL_POD_CLOUD_INIT_USER_FILE_PATTERN" default:"kamino-router-{network}-user-data.yaml"`
}

// Server holds all application dependencies
type Server struct {
	Config        *Config
	DBPool        *pgxpool.Pool
	ProxmoxClient *proxmox.Client
	ProxmoxImport *proxmox.InventoryImporter
	ADClient      *activedirectory.Client
	ADSync        *activedirectory.Sync
}

const proxmoxVNetIDMaxLength = 8

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

func validatePodVNetPrefix(prefix string, maxNetworkNumber int32, envVar string) error {
	trimmed := strings.TrimSpace(prefix)
	if trimmed == "" {
		return fmt.Errorf("%s must not be empty", envVar)
	}

	vnetName := trimmed + strconv.Itoa(int(maxNetworkNumber))
	if len(vnetName) > proxmoxVNetIDMaxLength {
		return fmt.Errorf("%s plus configured network number must fit Proxmox VNet 8-character limit", envVar)
	}

	return nil
}

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
	maxNetworkNumber := config.PodCloneNetworkMax
	if config.PodDevNetworkMax > maxNetworkNumber {
		maxNetworkNumber = config.PodDevNetworkMax
	}
	if err := validatePodVNetPrefix(vnetPrefix, maxNetworkNumber, "POD_CLONE_VNET_PREFIX"); err != nil {
		return handlers.PodRouterCloneConfig{}, err
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

	if err := validatePodVNetPrefix(personalPrefix, config.PersonalPodNetworkMax, "PERSONAL_POD_VNET_PREFIX"); err != nil {
		return handlers.PodRouterCloneConfig{}, err
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
	if personalPrefix == vnetPrefix &&
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
		return handlers.PodRouterCloneConfig{}, fmt.Errorf("PERSONAL_POD_NETWORK_MIN..PERSONAL_POD_NETWORK_MAX must not overlap pod ranges when PERSONAL_POD_VNET_PREFIX matches POD_CLONE_VNET_PREFIX")
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

	routerConfig := handlers.PodRouterCloneConfig{
		VNetPrefix:                       vnetPrefix,
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
		PersonalVNetPrefix:               personalPrefix,
		PersonalNetworkMin:               config.PersonalPodNetworkMin,
		PersonalNetworkMax:               config.PersonalPodNetworkMax,
		PersonalWANIPBase:                personalWANBase,
		PersonalCloudInitUserFilePattern: personalCloudInitUserFilePattern,
	}

	log.Printf(
		"Published pod clone networking configured: prefix=%q clone_range=%d-%d dev_range=%d-%d personal_range=%d-%d personal_prefix=%q wait_timeout=%s cloud_init_storage=%q internal_subnet=%s",
		routerConfig.VNetPrefix,
		routerConfig.NetworkMin,
		routerConfig.NetworkMax,
		routerConfig.DevNetworkMin,
		routerConfig.DevNetworkMax,
		routerConfig.PersonalNetworkMin,
		routerConfig.PersonalNetworkMax,
		routerConfig.PersonalVNetPrefix,
		routerConfig.RouterWaitTimeout,
		routerConfig.CloudInitStorage,
		routerConfig.InternalSubnet,
	)

	return routerConfig, nil
}

func resolveConfiguredAdminGroup(
	config *Config,
	adClient *activedirectory.Client,
) (*activedirectory.Group, error) {
	if adClient == nil || strings.TrimSpace(config.LDAPAdminGroupDN) == "" {
		return nil, nil
	}

	group, err := adClient.FetchGroupByDN(config.LDAPAdminGroupDN)
	if err != nil {
		return nil, fmt.Errorf(
			"fetch admin group from LDAP_ADMIN_GROUP_DN %q: %w",
			config.LDAPAdminGroupDN,
			err,
		)
	}
	if group == nil {
		return nil, fmt.Errorf(
			"no group found at LDAP_ADMIN_GROUP_DN %q",
			config.LDAPAdminGroupDN,
		)
	}
	return group, nil
}

func resolveProtectedAdminGroupPrincipalID(
	ctx context.Context,
	dbPool *pgxpool.Pool,
	group *activedirectory.Group,
) (uuid.UUID, error) {
	if group == nil {
		return uuid.Nil, nil
	}
	if strings.TrimSpace(group.SID) == "" {
		return uuid.Nil, fmt.Errorf("protected admin group %q does not have a SID", group.Name)
	}

	q := database.New(dbPool)
	providerID, err := q.GetPrincipalProvider(ctx)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, nil
		}
		return uuid.Nil, fmt.Errorf("load principal provider: %w", err)
	}

	principal, err := q.GetPrincipalByExternalID(ctx, database.GetPrincipalByExternalIDParams{
		ProviderID: providerID,
		ExternalID: group.SID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, nil
		}
		return uuid.Nil, fmt.Errorf("load protected admin group principal: %w", err)
	}

	return principal.ID, nil
}

// init the environment
func init() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables from system")
	} else {
		log.Println("Loaded configuration from .env file")
	}
}

// newServer creates a new server instance with all dependencies initialized
func newServer(config *Config) (*Server, error) {
	// Initialize database connection pool
	dbPool, err := pgxpool.New(context.Background(), config.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("unable to create connection pool: %w", err)
	}

	// Verify connection
	if err := dbPool.Ping(context.Background()); err != nil {
		dbPool.Close()
		return nil, fmt.Errorf("unable to ping database: %w", err)
	}

	// Initialize Proxmox client
	proxmoxNodes := splitCSV(config.ProxmoxNodes)
	if len(proxmoxNodes) == 0 {
		return nil, fmt.Errorf("PROXMOX_NODES must contain at least one node")
	}

	pxClient := proxmox.NewClient(
		config.ProxmoxURL,
		config.ProxmoxTokenID,
		config.ProxmoxTokenSecret,
		config.ProxmoxInsecure,
		proxmoxNodes,
	)

	// Initialize sync service
	pxImport := proxmox.NewInventoryImporter(dbPool, pxClient)

	server := &Server{
		Config:        config,
		DBPool:        dbPool,
		ProxmoxClient: pxClient,
		ProxmoxImport: pxImport,
	}

	// Initialize AD client and sync if LDAP is configured
	if config.LDAPUrl != "" {
		adClient := activedirectory.NewClient(
			config.LDAPUrl,
			config.LDAPBindDN,
			config.LDAPBindPassword,
			config.LDAPSearchBaseDN,
			config.LDAPUserOU,
			config.LDAPGroupOU,
			config.LDAPInsecure,
		)
		server.ADClient = adClient
		server.ADSync = activedirectory.NewSync(dbPool, adClient)
	}

	return server, nil
}

func main() {
	var config Config
	if err := envconfig.Process("", &config); err != nil {
		log.Fatalf("Failed to process environment configuration: %v", err)
	}
	routerCloneConfig, err := buildPodRouterCloneConfig(&config)
	if err != nil {
		log.Fatalf("Invalid pod router clone configuration: %v", err)
	}

	// Initialize server with all dependencies
	server, err := newServer(&config)
	if err != nil {
		log.Fatalf("Failed to initialize server: %v", err)
	}
	defer server.DBPool.Close()

	// Run initial Proxmox inventory sync
	if err := server.ProxmoxImport.Run(context.Background()); err != nil {
		log.Printf("Initial Proxmox sync failed: %v", err)
	}

	// Run initial AD sync if configured
	if server.ADSync != nil {
		if err := server.ADSync.Run(context.Background()); err != nil {
			log.Printf("Initial AD sync failed: %v", err)
		}
	}

	inventoryNotifier := inventory.NewNotifier(server.DBPool)
	go inventoryNotifier.Start(context.Background())
	requestsNotifier := requestqueue.NewNotifier(server.DBPool)
	go requestsNotifier.Start(context.Background())
	vmStatusNotifier := vmstatus.NewNotifier(server.ProxmoxClient)
	go vmStatusNotifier.Start(context.Background())

	proxmoxMirror := proxmox.NewInventoryMirror(server.DBPool, server.ProxmoxClient)
	if proxmoxMirror != nil {
		if err := proxmoxMirror.Reconcile(context.Background()); err != nil {
			log.Printf("Initial Proxmox mirror reconcile failed: %v", err)
		}
	}

	adminGroup, err := resolveConfiguredAdminGroup(server.Config, server.ADClient)
	if err != nil {
		log.Printf("Admin group discovery failed: %v", err)
	}

	var bootstrapAdminGroups []string
	if adminGroup != nil && strings.TrimSpace(adminGroup.Name) != "" {
		bootstrapAdminGroups = []string{adminGroup.Name}
	}

	protectedACLPrincipalID, err := resolveProtectedAdminGroupPrincipalID(
		context.Background(),
		server.DBPool,
		adminGroup,
	)
	if err != nil {
		log.Printf("Protected admin group principal discovery failed: %v", err)
	}

	var protectedACLPrincipalIDs []uuid.UUID
	if protectedACLPrincipalID != uuid.Nil {
		protectedACLPrincipalIDs = []uuid.UUID{protectedACLPrincipalID}
	}

	authzService := authorization.NewService(server.DBPool, protectedACLPrincipalIDs)
	if err := authzService.BootstrapRootAccess(
		context.Background(),
		bootstrapAdminGroups,
	); err != nil {
		log.Printf("Inventory ACL bootstrap failed: %v", err)
	}

	// Initialize handlers
	inventoryService := inventory.NewService(
		server.DBPool,
		inventoryNotifier,
		proxmoxMirror,
		protectedACLPrincipalIDs,
	)
	if err := inventoryService.NormalizeInheritance(context.Background()); err != nil {
		log.Printf("Inventory inheritance normalization failed: %v", err)
	}
	auditService := audit.NewService(server.DBPool)
	go auditService.StartRetention(context.Background())
	inventoryHandler := &handlers.InventoryHandler{
		Service:  inventoryService,
		Notifier: inventoryNotifier,
		PX:       server.ProxmoxClient,
		Authz:    authzService,
		Audit:    auditService,
	}
	vncHandler := handlers.NewVNCHandler(server.ProxmoxClient, config.FrontendURL)
	vncHandler.Authz = authzService
	vmActionExecutor := vmactions.NewExecutor(
		server.ProxmoxClient,
		inventoryService,
		vmStatusNotifier,
	)
	vmActionClaims := vmactions.NewClaims(server.DBPool)
	vmHandler := &handlers.VMHandler{
		PX:                    server.ProxmoxClient,
		DB:                    server.DBPool,
		Importer:              server.ProxmoxImport,
		Service:               inventoryService,
		Notifier:              vmStatusNotifier,
		Authz:                 authzService,
		Actions:               vmActionExecutor,
		Claims:                vmActionClaims,
		Audit:                 auditService,
		PersonalPodVNetPrefix: routerCloneConfig.PersonalVNetPrefix,
	}
	vmCreateHandler := &handlers.VMCreateHandler{
		PX:                    server.ProxmoxClient,
		DB:                    server.DBPool,
		Importer:              server.ProxmoxImport,
		Service:               inventoryService,
		Authz:                 authzService,
		Audit:                 auditService,
		PersonalPodVNetPrefix: routerCloneConfig.PersonalVNetPrefix,
	}
	routerTemplateItemID, err := parseOptionalUUID(server.Config.PodRouterTemplate)
	if err != nil {
		log.Fatalf("Invalid POD_ROUTER_TEMPLATE_ITEM_ID: %v", err)
	}
	personalPodRouterTemplateItemID, err := parseOptionalUUID(server.Config.PersonalPodRouterTemplateItemID)
	if err != nil {
		log.Fatalf("Invalid PERSONAL_POD_ROUTER_TEMPLATE_ITEM_ID: %v", err)
	}
	templatesFolderItemID, err := parseOptionalUUID(server.Config.TemplatesFolderItemID)
	if err != nil {
		log.Fatalf("Invalid TEMPLATES_FOLDER_ITEM_ID: %v", err)
	}
	podsFolderItemID, err := parseOptionalUUID(server.Config.PodsFolderItemID)
	if err != nil {
		log.Fatalf("Invalid PODS_FOLDER_ITEM_ID: %v", err)
	}
	personalPodsFolderItemID, err := parseOptionalUUID(server.Config.PersonalPodsFolderItemID)
	if err != nil {
		log.Fatalf("Invalid PERSONAL_PODS_FOLDER_ITEM_ID: %v", err)
	}
	podsHandler := &handlers.PodsHandler{
		PX:                              server.ProxmoxClient,
		Importer:                        server.ProxmoxImport,
		Service:                         inventoryService,
		Authz:                           authzService,
		DB:                              server.DBPool,
		Notifier:                        vmStatusNotifier,
		Actions:                         vmActionExecutor,
		RouterTemplateItemID:            routerTemplateItemID,
		PersonalPodRouterTemplateItemID: personalPodRouterTemplateItemID,
		RouterCloneConfig:               routerCloneConfig,
		Audit:                           auditService,
		TemplatesFolderItemID:           templatesFolderItemID,
		PodsFolderItemID:                podsFolderItemID,
		PersonalPodsFolderItemID:        personalPodsFolderItemID,
	}
	sdnHandler := &handlers.SDNHandler{
		PX:    server.ProxmoxClient,
		Authz: authzService,
		Audit: auditService,
	}
	proxmoxSyncHandler := &handlers.ProxmoxSyncHandler{
		Importer: server.ProxmoxImport,
		Service:  inventoryService,
		Authz:    authzService,
		Audit:    auditService,
	}
	auditHandler := &handlers.AuditHandler{
		Audit: auditService,
		Authz: authzService,
	}
	authzHandler := &handlers.AuthorizationHandler{Authz: authzService, Audit: auditService}
	requestService := requestqueue.NewService(
		server.DBPool,
		authzService,
		inventoryService,
		server.ProxmoxClient,
		vmActionExecutor,
		requestsNotifier,
		auditService,
		podsHandler,
	)
	requestsHandler := &handlers.RequestsHandler{Service: requestService}

	if fenced, err := requestService.FailStaleExecutingRequests(context.Background()); err != nil {
		log.Printf("Stale executing request recovery failed: %v", err)
	} else if len(fenced) > 0 {
		log.Printf("Recovered %d stranded executing request(s): %v", len(fenced), fenced)
	}

	eventsHandler := &handlers.EventsHandler{
		InventoryNotifier: inventoryNotifier,
		VMNotifier:        vmStatusNotifier,
		Requests:          requestService,
		Authz:             authzService,
	}

	var authHandler *handlers.AuthHandler
	var authService *auth.Service
	var principalsHandler *handlers.PrincipalsHandler
	if server.ADClient != nil {
		authService, err = auth.NewService(server.Config.JWTSecret)
		if err != nil {
			log.Fatal(err)
		}

		authHandler = &handlers.AuthHandler{
			Auth:         authService,
			Sessions:     auth.NewSessionManager(server.DBPool),
			ADClient:     server.ADClient,
			Authz:        authzService,
			DB:           server.DBPool,
			CookieSecure: strings.HasPrefix(server.Config.FrontendURL, "https://"),
		}

		adService := activedirectory.NewService(server.DBPool, server.ADClient, server.ADSync)
		principalsHandler = &handlers.PrincipalsHandler{
			Provider: adService,
			Authz:    authzService,
			Audit:    auditService,
		}
	}

	r := gin.Default()
	r.Use(middleware.CORS(server.Config.FrontendURL))

	// Register all API routes
	routes.RegisterRoutes(
		r,
		authHandler,
		authService,
		inventoryHandler,
		vncHandler,
		vmHandler,
		vmCreateHandler,
		podsHandler,
		sdnHandler,
		principalsHandler,
		authzHandler,
		requestsHandler,
		eventsHandler,
		proxmoxSyncHandler,
		auditHandler,
	)

	r.Run(config.Port)
}
