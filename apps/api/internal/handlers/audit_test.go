package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/audit"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func setupAuditTestRouter(handler *AuditHandler, withUser bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	if withUser {
		r.Use(func(c *gin.Context) {
			c.Set("userID", uuid.New())
			c.Next()
		})
	}
	r.GET("/api/v1/admin/audit/actions", handler.List)
	return r
}

func TestAuditListRequiresAuth(t *testing.T) {
	handler := &AuditHandler{
		Audit: &audit.Service{},
	}
	router := setupAuditTestRouter(handler, false)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/admin/audit/actions", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuditListRequiresUser(t *testing.T) {
	handler := &AuditHandler{
		Audit: &audit.Service{},
	}
	router := setupAuditTestRouter(handler, false)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/admin/audit/actions", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 when no user context, got %d", w.Code)
	}
}

func TestParsePageParam(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		want   int32
		wantOk bool
	}{
		{"empty defaults to 1", "", 1, true},
		{"valid page", "3", 3, true},
		{"page one", "1", 1, true},
		{"zero rejected", "0", 0, false},
		{"negative rejected", "-1", 0, false},
		{"non-numeric rejected", "abc", 0, false},
		{"float rejected", "1.5", 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := parsePageParam(tt.input)
			if ok != tt.wantOk {
				t.Fatalf("parsePageParam(%q) ok = %v, want %v", tt.input, ok, tt.wantOk)
			}
			if ok && got != tt.want {
				t.Errorf("parsePageParam(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestParseRowsParam(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		want   int32
		wantOk bool
	}{
		{"empty defaults to 25", "", 25, true},
		{"allowed value 10", "10", 10, true},
		{"allowed value 20", "20", 20, true},
		{"allowed value 25", "25", 25, true},
		{"allowed value 30", "30", 30, true},
		{"allowed value 40", "40", 40, true},
		{"allowed value 50", "50", 50, true},
		{"disallowed value rejected", "15", 0, false},
		{"zero rejected", "0", 0, false},
		{"negative rejected", "-25", 0, false},
		{"non-numeric rejected", "abc", 0, false},
		{"over max disallowed", "100", 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := parseRowsParam(tt.input)
			if ok != tt.wantOk {
				t.Fatalf("parseRowsParam(%q) ok = %v, want %v", tt.input, ok, tt.wantOk)
			}
			if ok && got != tt.want {
				t.Errorf("parseRowsParam(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestBuildActionEventResponseMapsPodFields(t *testing.T) {
	actorID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	podID := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	createdAt := time.Date(2026, 7, 1, 18, 45, 0, 0, time.UTC)

	item := buildActionEventResponse(database.ListActionEventsPaginatedRow{
		ID:               42,
		ActorPrincipalID: &actorID,
		ActionKind:       "pod.publish",
		TargetKind:       "pod",
		PodID:            &podID,
		PodTitle:         "Pod Alpha",
		PodSlug:          "pod-alpha",
		PodFolderPath:    "Pods/POD_NAME",
		Status:           "succeeded",
		ActorUsername:    "operator",
		CreatedAt: pgtype.Timestamptz{
			Time:  createdAt,
			Valid: true,
		},
	})

	if item.PodTitle == nil || *item.PodTitle != "Pod Alpha" {
		t.Fatalf("expected pod title to be mapped, got %#v", item.PodTitle)
	}
	if item.PodSlug == nil || *item.PodSlug != "pod-alpha" {
		t.Fatalf("expected pod slug to be mapped, got %#v", item.PodSlug)
	}
	if item.PodFolderPath == nil || *item.PodFolderPath != "Pods/POD_NAME" {
		t.Fatalf("expected pod folder path to be mapped, got %#v", item.PodFolderPath)
	}
	if item.PodID == nil || *item.PodID != podID.String() {
		t.Fatalf("expected pod id to be mapped, got %#v", item.PodID)
	}
	if item.ActorPrincipalID == nil || *item.ActorPrincipalID != actorID.String() {
		t.Fatalf("expected actor principal id to be mapped, got %#v", item.ActorPrincipalID)
	}
	if item.CreatedAt != "2026-07-01T18:45:00Z" {
		t.Fatalf("expected created_at to be formatted in UTC, got %q", item.CreatedAt)
	}
}

func TestBuildActionEventResponseLeavesOptionalFieldsEmptyWhenUnavailable(t *testing.T) {
	item := buildActionEventResponse(database.ListActionEventsPaginatedRow{
		ID:            7,
		ActionKind:    "vm.delete",
		TargetKind:    "vm",
		Status:        "failed",
		ActorUsername: "operator",
	})

	if item.InventoryItemName != nil {
		t.Fatalf("expected inventory item name to be omitted, got %#v", item.InventoryItemName)
	}
	if item.InventoryItemParentID != nil {
		t.Fatalf("expected inventory item parent id to be omitted, got %#v", item.InventoryItemParentID)
	}
	if item.InventoryItemParentName != nil {
		t.Fatalf("expected inventory item parent name to be omitted, got %#v", item.InventoryItemParentName)
	}
	if item.InventoryItemPath != nil {
		t.Fatalf("expected inventory item path to be omitted, got %#v", item.InventoryItemPath)
	}
	if item.InventoryVmNode != nil {
		t.Fatalf("expected inventory vm node to be omitted, got %#v", item.InventoryVmNode)
	}
	if item.InventoryVmVmid != nil {
		t.Fatalf("expected inventory vmid to be omitted, got %#v", item.InventoryVmVmid)
	}
	if item.PodID != nil {
		t.Fatalf("expected pod id to be omitted, got %#v", item.PodID)
	}
	if item.PodTitle != nil {
		t.Fatalf("expected pod title to be omitted, got %#v", item.PodTitle)
	}
	if item.PodSlug != nil {
		t.Fatalf("expected pod slug to be omitted, got %#v", item.PodSlug)
	}
	if item.PodFolderPath != nil {
		t.Fatalf("expected pod folder path to be omitted, got %#v", item.PodFolderPath)
	}
	if item.ErrorMessage != nil {
		t.Fatalf("expected error message to be omitted, got %#v", item.ErrorMessage)
	}
	if item.CreatedAt != "" {
		t.Fatalf("expected created_at to be empty when unavailable, got %q", item.CreatedAt)
	}
}
