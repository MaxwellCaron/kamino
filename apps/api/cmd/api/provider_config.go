package main

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/principals/activedirectory"
	"github.com/MaxwellCaron/kamino/internal/principals/proxmoxprincipals"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	principalProviderActiveDirectory = "active_directory"
	principalProviderProxmox         = "proxmox"
)

func validatePrincipalProviderConfig(config *Config) error {
	provider := strings.TrimSpace(config.PrincipalProvider)
	if provider == "" {
		return fmt.Errorf("PRINCIPAL_PROVIDER is required")
	}
	switch provider {
	case principalProviderActiveDirectory:
		if strings.TrimSpace(config.LDAPUrl) == "" {
			return fmt.Errorf("PRINCIPAL_PROVIDER=active_directory requires LDAP_URL")
		}
		if strings.TrimSpace(config.LDAPBindDN) == "" {
			return fmt.Errorf("PRINCIPAL_PROVIDER=active_directory requires LDAP_BIND_DN")
		}
		if strings.TrimSpace(config.LDAPBindPassword) == "" {
			return fmt.Errorf("PRINCIPAL_PROVIDER=active_directory requires LDAP_BIND_PASSWORD")
		}
		if strings.TrimSpace(config.LDAPSearchBaseDN) == "" {
			return fmt.Errorf("PRINCIPAL_PROVIDER=active_directory requires LDAP_SEARCH_BASE_DN")
		}
		if strings.TrimSpace(config.LDAPUserOU) == "" {
			return fmt.Errorf("PRINCIPAL_PROVIDER=active_directory requires LDAP_USER_OU")
		}
		if strings.TrimSpace(config.LDAPGroupOU) == "" {
			return fmt.Errorf("PRINCIPAL_PROVIDER=active_directory requires LDAP_GROUP_OU")
		}
		if strings.TrimSpace(config.ProxmoxManagedUserRealm) != "" {
			return fmt.Errorf("PROXMOX_MANAGED_USER_REALM is only valid when PRINCIPAL_PROVIDER=proxmox")
		}
	case principalProviderProxmox:
		if hasLDAPProviderConfiguration(config) {
			return fmt.Errorf("PRINCIPAL_PROVIDER=proxmox cannot be combined with LDAP provider configuration")
		}
	default:
		return fmt.Errorf(
			"PRINCIPAL_PROVIDER must be %q or %q, got %q",
			principalProviderActiveDirectory,
			principalProviderProxmox,
			provider,
		)
	}
	return nil
}

func hasLDAPProviderConfiguration(config *Config) bool {
	return strings.TrimSpace(config.LDAPUrl) != "" ||
		strings.TrimSpace(config.LDAPBindDN) != "" ||
		strings.TrimSpace(config.LDAPBindPassword) != "" ||
		strings.TrimSpace(config.LDAPSearchBaseDN) != "" ||
		strings.TrimSpace(config.LDAPUserOU) != "" ||
		strings.TrimSpace(config.LDAPGroupOU) != ""
}

func resolveManagedUserRealm(config *Config) string {
	if managed := strings.TrimSpace(config.ProxmoxManagedUserRealm); managed != "" {
		return managed
	}
	return strings.TrimSpace(config.ProxmoxAuthRealm)
}

func (server *Server) wirePrincipalProvider() error {
	switch strings.TrimSpace(server.Config.PrincipalProvider) {
	case principalProviderActiveDirectory:
		adClient := activedirectory.NewClient(
			server.Config.LDAPUrl,
			server.Config.LDAPBindDN,
			server.Config.LDAPBindPassword,
			server.Config.LDAPSearchBaseDN,
			server.Config.LDAPUserOU,
			server.Config.LDAPGroupOU,
			server.Config.LDAPInsecure,
		)
		server.ADClient = adClient
		adSync := activedirectory.NewSync(server.DBPool, adClient)
		adService := activedirectory.NewService(server.DBPool, adClient, adSync)
		server.PrincipalProvider = adService
		server.PrincipalAuthenticator = adService
		server.PrincipalSync = adSync.Run
	case principalProviderProxmox:
		proxmoxService := proxmoxprincipals.NewService(
			server.DBPool,
			server.ProxmoxClient,
			server.Config.ProxmoxAuthRealm,
			resolveManagedUserRealm(server.Config),
		)
		server.PrincipalProvider = proxmoxService
		server.PrincipalAuthenticator = proxmoxService
		server.PrincipalSync = proxmoxService.TriggerSync
	default:
		return fmt.Errorf("unsupported principal provider %q", server.Config.PrincipalProvider)
	}
	return nil
}

type bootstrapAdminGroup struct {
	ExternalID  string
	DisplayName string
}

func resolveBootstrapAdminGroup(
	ctx context.Context,
	config *Config,
	adClient *activedirectory.Client,
) (*bootstrapAdminGroup, error) {
	bootstrapValue := strings.TrimSpace(config.PrincipalBootstrapAdminGroup)
	if bootstrapValue == "" {
		return nil, nil
	}

	switch strings.TrimSpace(config.PrincipalProvider) {
	case principalProviderActiveDirectory:
		if adClient == nil {
			return nil, fmt.Errorf("AD client is required to resolve PRINCIPAL_BOOTSTRAP_ADMIN_GROUP")
		}
		group, err := adClient.FetchGroupByDN(ctx, bootstrapValue)
		if err != nil {
			return nil, fmt.Errorf(
				"fetch admin group from PRINCIPAL_BOOTSTRAP_ADMIN_GROUP %q: %w",
				bootstrapValue,
				err,
			)
		}
		if group == nil {
			return nil, fmt.Errorf(
				"no group found at PRINCIPAL_BOOTSTRAP_ADMIN_GROUP %q",
				bootstrapValue,
			)
		}
		return &bootstrapAdminGroup{
			ExternalID:  group.SID,
			DisplayName: group.Name,
		}, nil
	case principalProviderProxmox:
		return &bootstrapAdminGroup{
			ExternalID:  bootstrapValue,
			DisplayName: bootstrapValue,
		}, nil
	default:
		return nil, fmt.Errorf("unsupported principal provider %q", config.PrincipalProvider)
	}
}

func resolveProtectedAdminGroupPrincipalID(
	ctx context.Context,
	dbPool *pgxpool.Pool,
	providerType database.PrincipalProviderType,
	externalID string,
) (uuid.UUID, error) {
	if strings.TrimSpace(externalID) == "" {
		return uuid.Nil, nil
	}

	q := database.New(dbPool)
	providerID, err := q.GetPrincipalProviderByType(ctx, providerType)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, nil
		}
		return uuid.Nil, fmt.Errorf("load principal provider: %w", err)
	}

	principal, err := q.GetPrincipalByExternalID(ctx, database.GetPrincipalByExternalIDParams{
		ProviderID: providerID,
		ExternalID: externalID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, nil
		}
		return uuid.Nil, fmt.Errorf("load protected admin group principal: %w", err)
	}

	return principal.ID, nil
}

func configuredPrincipalProviderType(config *Config) database.PrincipalProviderType {
	switch strings.TrimSpace(config.PrincipalProvider) {
	case principalProviderProxmox:
		return database.PrincipalProviderTypeProxmox
	default:
		return database.PrincipalProviderTypeActiveDirectory
	}
}
