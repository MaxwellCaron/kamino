package proxmoxadmin

import (
	"context"
	"net/http"
	"sync/atomic"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlertest"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func TestClusterUsageHistory_NoPrincipal(t *testing.T) {
	t.Parallel()

	px := &fakeMetricsProxmox{}
	h := &MetricsHandler{Authz: &fakeMetricsAuthz{}, PX: px}
	r := gin.New()
	r.GET("/proxmox/cluster/usage-history", h.GetClusterUsageHistory)
	w := handlertest.DoJSONRequest(r, http.MethodGet, "/proxmox/cluster/usage-history", "")

	handlertest.AssertStatus(t, w, http.StatusUnauthorized)
	if got := px.clusterUsageCalls.Load(); got != 0 {
		t.Fatalf("Proxmox calls = %d, want 0", got)
	}
}

func TestClusterUsageHistory_PermissionDenied(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	authz := &fakeMetricsAuthz{requireMgmtErr: authorization.ErrForbidden}
	px := &fakeMetricsProxmox{}
	h := &MetricsHandler{Authz: authz, PX: px}

	r := handlertest.NewEngine(http.MethodGet, "/proxmox/cluster/usage-history", principalID, h.GetClusterUsageHistory)
	w := handlertest.DoJSONRequest(r, http.MethodGet, "/proxmox/cluster/usage-history", "")

	handlertest.AssertStatus(t, w, http.StatusForbidden)
	if authz.requestedManagement != authorization.ManagementPermissionAdministrator {
		t.Errorf("expected Administrator to be requested, got %q", authz.requestedManagement)
	}
	if got := px.clusterUsageCalls.Load(); got != 0 {
		t.Fatalf("Proxmox calls = %d, want 0", got)
	}
}

func TestClusterUsageHistory_HappyPath(t *testing.T) {
	t.Parallel()

	principalID := uuid.New()
	authz := &fakeMetricsAuthz{}
	var gotTimeframe string
	px := &fakeMetricsProxmox{
		getClusterUsageHistory: func(_ context.Context, timeframe string) (proxmox.ClusterUsageHistory, error) {
			gotTimeframe = timeframe
			return proxmox.ClusterUsageHistory{Points: []proxmox.UsageHistoryPoint{{}}}, nil
		},
	}
	h := &MetricsHandler{Authz: authz, PX: px}

	r := handlertest.NewEngine(http.MethodGet, "/proxmox/cluster/usage-history", principalID, h.GetClusterUsageHistory)
	w := handlertest.DoJSONRequest(r, http.MethodGet, "/proxmox/cluster/usage-history?timeframe=week", "")

	handlertest.AssertStatus(t, w, http.StatusOK)
	if authz.requestedManagement != authorization.ManagementPermissionAdministrator {
		t.Errorf("expected Administrator to be requested, got %q", authz.requestedManagement)
	}
	if got := px.clusterUsageCalls.Load(); got != 1 {
		t.Fatalf("Proxmox calls = %d, want 1", got)
	}
	if gotTimeframe != "week" {
		t.Fatalf("timeframe = %q, want %q", gotTimeframe, "week")
	}
}

type fakeMetricsProxmox struct {
	getClusterUsageHistory func(context.Context, string) (proxmox.ClusterUsageHistory, error)
	clusterUsageCalls      atomic.Int32
}
type fakeMetricsAuthz struct {
	requireMgmtErr      error
	requestedManagement authorization.ManagementPermission
}

func (f *fakeMetricsAuthz) RequireManagement(_ context.Context, _ uuid.UUID, permission authorization.ManagementPermission) error {
	f.requestedManagement = permission
	return f.requireMgmtErr
}

func (f *fakeMetricsProxmox) GetClusterUsageHistory(ctx context.Context, timeframe string) (proxmox.ClusterUsageHistory, error) {
	f.clusterUsageCalls.Add(1)
	if f.getClusterUsageHistory == nil {
		panic("fakeVMCreateProxmox: GetClusterUsageHistory not configured for this test")
	}
	return f.getClusterUsageHistory(ctx, timeframe)
}
