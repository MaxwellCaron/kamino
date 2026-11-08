package handlertest

import (
	"testing"

	"github.com/MaxwellCaron/kamino/internal/podnetwork"
)

func TestNetworkCatalog(t *testing.T) *podnetwork.Catalog {
	t.Helper()

	catalog, err := podnetwork.NewCatalog()
	if err != nil {
		t.Fatalf("NewCatalog() error = %v", err)
	}
	return catalog
}
