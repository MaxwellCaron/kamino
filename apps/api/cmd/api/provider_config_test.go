package main

import (
	"strings"
	"testing"
)

func TestValidatePrincipalProviderConfig(t *testing.T) {
	base := Config{
		DatabaseURL:        "postgres://test:test@localhost/test?sslmode=disable",
		JWTSecret:          "secret",
		ProxmoxURL:         "https://proxmox.test:8006",
		ProxmoxTokenID:     "test@pve!test",
		ProxmoxTokenSecret: "secret",
		ProxmoxNodes:       "node1",
	}

	t.Run("missing provider rejected", func(t *testing.T) {
		cfg := base
		err := validatePrincipalProviderConfig(&cfg)
		if err == nil || !strings.Contains(err.Error(), "PRINCIPAL_PROVIDER is required") {
			t.Fatalf("error = %v", err)
		}
	})

	t.Run("invalid provider rejected", func(t *testing.T) {
		cfg := base
		cfg.PrincipalProvider = "ldap"
		err := validatePrincipalProviderConfig(&cfg)
		if err == nil || !strings.Contains(err.Error(), "must be") {
			t.Fatalf("error = %v", err)
		}
	})

	t.Run("active directory requires ldap", func(t *testing.T) {
		cfg := base
		cfg.PrincipalProvider = principalProviderActiveDirectory
		err := validatePrincipalProviderConfig(&cfg)
		if err == nil || !strings.Contains(err.Error(), "LDAP_URL") {
			t.Fatalf("error = %v", err)
		}
	})

	t.Run("proxmox rejects ldap configuration", func(t *testing.T) {
		cfg := base
		cfg.PrincipalProvider = principalProviderProxmox
		cfg.LDAPUrl = "ldaps://ad.example.internal"
		err := validatePrincipalProviderConfig(&cfg)
		if err == nil || !strings.Contains(err.Error(), "LDAP provider configuration") {
			t.Fatalf("error = %v", err)
		}
	})

	t.Run("proxmox does not require ldap envs", func(t *testing.T) {
		cfg := base
		cfg.PrincipalProvider = principalProviderProxmox
		if err := validatePrincipalProviderConfig(&cfg); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("managed user realm defaults to auth realm", func(t *testing.T) {
		cfg := base
		cfg.PrincipalProvider = principalProviderProxmox
		cfg.ProxmoxAuthRealm = "ad"
		if got := resolveManagedUserRealm(&cfg); got != "ad" {
			t.Fatalf("resolveManagedUserRealm() = %q, want ad", got)
		}
		cfg.ProxmoxManagedUserRealm = "pam"
		if got := resolveManagedUserRealm(&cfg); got != "pam" {
			t.Fatalf("resolveManagedUserRealm() = %q, want pam", got)
		}
	})
}
