package sdn

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/handlertest"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type fakeSDNVNetCreator struct {
	createCalls int
	applyCalls  int
	failOn      map[string]error
}

func TestValidateAndBuildCreateVNetParams(t *testing.T) {
	t.Run("valid request with boolean flags", func(t *testing.T) {
		id, params, err := validateAndBuildCreateVNetParams(createVNetRequest{
			VNet:         "pod245",
			Zone:         "zone1",
			Tag:          245,
			Alias:        "Pod 245",
			VLANAware:    true,
			IsolatePorts: true,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if id != "pod245" {
			t.Fatalf("id = %q, want pod245", id)
		}
		if params["vlanaware"] != "1" {
			t.Fatalf("vlanaware = %q, want 1", params["vlanaware"])
		}
		if params["isolate-ports"] != "1" {
			t.Fatalf("isolate-ports = %q, want 1", params["isolate-ports"])
		}
	})

	t.Run("whitespace-only zone is invalid", func(t *testing.T) {
		_, _, err := validateAndBuildCreateVNetParams(createVNetRequest{
			VNet: "pod1",
			Zone: "   ",
		})
		if err == nil {
			t.Fatal("expected error for whitespace-only zone")
		}
	})

	t.Run("tag zero is omitted", func(t *testing.T) {
		_, params, err := validateAndBuildCreateVNetParams(createVNetRequest{
			VNet: "pod1",
			Zone: "zone1",
			Tag:  0,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if _, ok := params["tag"]; ok {
			t.Fatalf("tag should be omitted, got %q", params["tag"])
		}
	})

	t.Run("tag one is included", func(t *testing.T) {
		_, params, err := validateAndBuildCreateVNetParams(createVNetRequest{
			VNet: "pod1",
			Zone: "zone1",
			Tag:  1,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if params["tag"] != "1" {
			t.Fatalf("tag = %q, want 1", params["tag"])
		}
	})
}

func TestExecuteBulkCreateVNets(t *testing.T) {
	validItems := func(ids ...string) []validatedCreateVNet {
		items := make([]validatedCreateVNet, 0, len(ids))
		for _, id := range ids {
			items = append(items, validatedCreateVNet{
				id:   id,
				zone: "zone1",
				params: map[string]string{
					"type": "vnet",
					"vnet": id,
					"zone": "zone1",
				},
			})
		}
		return items
	}

	t.Run("three valid requests apply once", func(t *testing.T) {
		px := &fakeSDNVNetCreator{}
		resp := executeBulkCreateVNets(context.Background(), px, validItems("a1", "a2", "a3"), true)
		if px.createCalls != 3 {
			t.Fatalf("createCalls = %d, want 3", px.createCalls)
		}
		if px.applyCalls != 1 {
			t.Fatalf("applyCalls = %d, want 1", px.applyCalls)
		}
		if len(resp.Created) != 3 || len(resp.Failed) != 0 {
			t.Fatalf("Created = %v Failed = %v", resp.Created, resp.Failed)
		}
	})

	t.Run("partial failure still applies once", func(t *testing.T) {
		px := &fakeSDNVNetCreator{failOn: map[string]error{
			"a2": errors.New("create failed"),
		}}
		resp := executeBulkCreateVNets(context.Background(), px, validItems("a1", "a2", "a3"), true)
		if px.applyCalls != 1 {
			t.Fatalf("applyCalls = %d, want 1", px.applyCalls)
		}
		if len(resp.Created) != 2 || len(resp.Failed) != 1 {
			t.Fatalf("Created = %v Failed = %v", resp.Created, resp.Failed)
		}
	})

	t.Run("all failures skip apply", func(t *testing.T) {
		px := &fakeSDNVNetCreator{failOn: map[string]error{
			"a1": errors.New("create failed"),
			"a2": errors.New("create failed"),
		}}
		resp := executeBulkCreateVNets(context.Background(), px, validItems("a1", "a2"), true)
		if px.applyCalls != 0 {
			t.Fatalf("applyCalls = %d, want 0", px.applyCalls)
		}
		if len(resp.Created) != 0 || len(resp.Failed) != 2 {
			t.Fatalf("Created = %v Failed = %v", resp.Created, resp.Failed)
		}
	})

	t.Run("can skip apply for staged frontend flow", func(t *testing.T) {
		px := &fakeSDNVNetCreator{}
		resp := executeBulkCreateVNets(context.Background(), px, validItems("a1", "a2"), false)
		if px.applyCalls != 0 {
			t.Fatalf("applyCalls = %d, want 0", px.applyCalls)
		}
		if len(resp.Created) != 2 || len(resp.Failed) != 0 {
			t.Fatalf("Created = %v Failed = %v", resp.Created, resp.Failed)
		}
	})
}

func TestToVNetResponseMapsIsolatePorts(t *testing.T) {
	v := proxmox.VNet{
		VNet:         "pod245",
		Zone:         "z1",
		VLANAware:    true,
		IsolatePorts: true,
	}
	resp := toVNetResponse(v)

	if resp.VNet != "pod245" {
		t.Errorf("VNet = %q, want %q", resp.VNet, "pod245")
	}
	if !resp.IsolatePorts {
		t.Error("IsolatePorts = false, want true")
	}
	if !resp.VLANAware {
		t.Error("VLANAware = false, want true")
	}
}

func (f *fakeSDNVNetCreator) CreateVNet(_ context.Context, params map[string]string) error {
	f.createCalls++
	if err, ok := f.failOn[params["vnet"]]; ok {
		return err
	}
	return nil
}

func (f *fakeSDNVNetCreator) ApplySDN(context.Context) error {
	f.applyCalls++
	return nil
}

type sdnPermissionDB struct {
	pgx.Tx
	allowed bool
}

func (db *sdnPermissionDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return &sdnPermissionRows{available: db.allowed}, nil
}

func (db *sdnPermissionDB) QueryRow(context.Context, string, ...any) pgx.Row {
	return sdnAuditRow{}
}

type sdnAuditRow struct{}

func (sdnAuditRow) Scan(...any) error { return nil }

type sdnPermissionRows struct {
	pgx.Rows
	available bool
}

func (r *sdnPermissionRows) Next() bool {
	available := r.available
	r.available = false
	return available
}
func (r *sdnPermissionRows) Scan(dest ...any) error {
	*dest[0].(*string) = string(authorization.ManagementPermissionAdministrator)
	return nil
}
func (r *sdnPermissionRows) Err() error { return nil }
func (r *sdnPermissionRows) Close()     {}

func TestUpdateVNetApplyStages(t *testing.T) {
	for _, tc := range []struct {
		name        string
		query       string
		saveFails   bool
		forbidden   bool
		wantStatus  int
		wantUpdates int
		wantApplies int
	}{
		{name: "default applies", wantStatus: http.StatusOK, wantUpdates: 1, wantApplies: 1},
		{name: "staged edit skips apply", query: "?apply=false", wantStatus: http.StatusOK, wantUpdates: 1},
		{name: "explicit apply", query: "?apply=true", wantStatus: http.StatusOK, wantUpdates: 1, wantApplies: 1},
		{name: "failed save skips apply", saveFails: true, wantStatus: http.StatusBadGateway, wantUpdates: 1},
		{name: "nonadmin cannot stage", query: "?apply=false", forbidden: true, wantStatus: http.StatusForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			updates, applies := 0, 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPut {
					t.Errorf("unexpected method: %s", r.Method)
				}
				switch r.URL.Path {
				case "/api2/json/cluster/sdn/vnets/lab1":
					updates++
					if tc.saveFails {
						http.Error(w, "save failed", http.StatusBadGateway)
						return
					}
				case "/api2/json/cluster/sdn":
					applies++

				default:
					t.Errorf("unexpected path: %s", r.URL.Path)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"data":null}`))
			}))
			defer server.Close()
			db := &sdnPermissionDB{allowed: !tc.forbidden}
			handler := &SDNHandler{PX: proxmox.NewHTTPTestClient(server), Authz: authorization.NewService(db, nil), Audit: audit.NewService(db)}
			router := handlertest.NewEngine(http.MethodPut, "/api/v1/sdn/vnets/:vnet", uuid.New(), handler.UpdateVNet)
			response := handlertest.DoJSONRequest(router, http.MethodPut, "/api/v1/sdn/vnets/lab1"+tc.query, `{"zone":"zone1","tag":12}`)
			handlertest.AssertStatus(t, response, tc.wantStatus)
			if updates != tc.wantUpdates || applies != tc.wantApplies {
				t.Fatalf("updates/applies = %d/%d, want %d/%d", updates, applies, tc.wantUpdates, tc.wantApplies)
			}
		})
	}
}
