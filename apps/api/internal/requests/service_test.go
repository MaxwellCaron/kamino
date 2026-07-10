package requests

import (
	"context"
	"errors"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/vmactions"
	"github.com/google/uuid"
)

type fakeVMActionClaimer struct {
	claimErr error
	claims   []fakeVMActionClaimCall
	releases []uuid.UUID
}

type fakeVMActionClaimCall struct {
	itemID           uuid.UUID
	action           string
	actorPrincipalID uuid.UUID
	detail           string
}

func (f *fakeVMActionClaimer) Claim(
	_ context.Context,
	itemID uuid.UUID,
	action string,
	actorPrincipalID uuid.UUID,
	detail string,
) error {
	f.claims = append(f.claims, fakeVMActionClaimCall{
		itemID:           itemID,
		action:           action,
		actorPrincipalID: actorPrincipalID,
		detail:           detail,
	})
	return f.claimErr
}

func (f *fakeVMActionClaimer) Release(_ context.Context, itemID uuid.UUID) error {
	f.releases = append(f.releases, itemID)
	return nil
}

func TestAcquireInventoryRequestClaim_ContentionBeforeTransition(t *testing.T) {
	itemID := uuid.New()
	requestID := uuid.New()
	reviewerID := uuid.New()
	claimer := &fakeVMActionClaimer{claimErr: vmactions.ErrActionInProgress}
	svc := &Service{vmClaims: claimer}

	release, err := svc.acquireInventoryRequestClaim(context.Background(), database.GetRequestForExecutionRow{
		ID:              requestID,
		Kind:            RequestKindInventoryVMPower,
		InventoryItemID: &itemID,
	}, reviewerID)
	if !errors.Is(err, ErrRequestActionInProgress) {
		t.Fatalf("acquireInventoryRequestClaim() error = %v, want ErrRequestActionInProgress", err)
	}
	if release != nil {
		t.Fatal("expected no release callback on contention")
	}
	if len(claimer.claims) != 1 {
		t.Fatalf("Claim calls = %d, want 1", len(claimer.claims))
	}
	if len(claimer.releases) != 0 {
		t.Fatalf("Release calls = %d, want 0 before status transition", len(claimer.releases))
	}
	got := claimer.claims[0]
	if got.itemID != itemID {
		t.Errorf("claim itemID = %s, want %s", got.itemID, itemID)
	}
	if got.action != "request:"+RequestKindInventoryVMPower {
		t.Errorf("claim action = %q, want %q", got.action, "request:"+RequestKindInventoryVMPower)
	}
	if got.actorPrincipalID != reviewerID {
		t.Errorf("claim actorPrincipalID = %s, want %s", got.actorPrincipalID, reviewerID)
	}
	if got.detail != requestID.String() {
		t.Errorf("claim detail = %q, want %q", got.detail, requestID.String())
	}
}

func TestAcquireInventoryRequestClaim_ReleaseOnSuccess(t *testing.T) {
	itemID := uuid.New()
	requestID := uuid.New()
	reviewerID := uuid.New()
	claimer := &fakeVMActionClaimer{}
	svc := &Service{vmClaims: claimer}

	release, err := svc.acquireInventoryRequestClaim(context.Background(), database.GetRequestForExecutionRow{
		ID:              requestID,
		Kind:            RequestKindInventoryVMSnapshotCreate,
		InventoryItemID: &itemID,
	}, reviewerID)
	if err != nil {
		t.Fatalf("acquireInventoryRequestClaim() error = %v", err)
	}
	if release == nil {
		t.Fatal("expected release callback")
	}

	release()
	if len(claimer.releases) != 1 {
		t.Fatalf("Release calls = %d, want 1", len(claimer.releases))
	}
	if claimer.releases[0] != itemID {
		t.Errorf("released itemID = %s, want %s", claimer.releases[0], itemID)
	}
}

func TestAcquireInventoryRequestClaim_ReleaseOnFailure(t *testing.T) {
	itemID := uuid.New()
	claimer := &fakeVMActionClaimer{}
	svc := &Service{vmClaims: claimer}

	release, err := svc.acquireInventoryRequestClaim(context.Background(), database.GetRequestForExecutionRow{
		ID:              uuid.New(),
		Kind:            RequestKindInventoryVMSnapshotRollback,
		InventoryItemID: &itemID,
	}, uuid.New())
	if err != nil {
		t.Fatalf("acquireInventoryRequestClaim() error = %v", err)
	}
	defer release()

	release()
	if len(claimer.releases) != 1 {
		t.Fatalf("Release calls = %d, want 1 after deferred cleanup", len(claimer.releases))
	}
}

func TestAcquireInventoryRequestClaim_PersonalPodSkipsClaim(t *testing.T) {
	claimer := &fakeVMActionClaimer{}
	svc := &Service{vmClaims: claimer}

	release, err := svc.acquireInventoryRequestClaim(context.Background(), database.GetRequestForExecutionRow{
		ID:   uuid.New(),
		Kind: RequestKindPersonalPodCreate,
	}, uuid.New())
	if err != nil {
		t.Fatalf("acquireInventoryRequestClaim() error = %v", err)
	}
	if release != nil {
		t.Fatal("expected no release callback for personal pod requests")
	}
	if len(claimer.claims) != 0 {
		t.Fatalf("Claim calls = %d, want 0 for personal pod requests", len(claimer.claims))
	}
}

func TestAcquireInventoryRequestClaim_NilClaimService(t *testing.T) {
	itemID := uuid.New()
	svc := &Service{}

	_, err := svc.acquireInventoryRequestClaim(context.Background(), database.GetRequestForExecutionRow{
		ID:              uuid.New(),
		Kind:            RequestKindInventoryVMPower,
		InventoryItemID: &itemID,
	}, uuid.New())
	if !errors.Is(err, ErrRequestServiceUnavailable) {
		t.Fatalf("acquireInventoryRequestClaim() error = %v, want ErrRequestServiceUnavailable", err)
	}
}

func TestIsInventoryVMRequestKind(t *testing.T) {
	tests := []struct {
		kind string
		want bool
	}{
		{RequestKindInventoryVMPower, true},
		{RequestKindInventoryVMSnapshotCreate, true},
		{RequestKindInventoryVMSnapshotRollback, true},
		{RequestKindPersonalPodCreate, false},
		{"unknown.kind", false},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			if got := isInventoryVMRequestKind(tt.kind); got != tt.want {
				t.Fatalf("isInventoryVMRequestKind(%q) = %v, want %v", tt.kind, got, tt.want)
			}
		})
	}
}

func TestNormalizeTablePageDefaults(t *testing.T) {
	page, rows, offset := normalizeTablePage(TablePageParams{})

	if page != 1 {
		t.Errorf("page = %d, want 1", page)
	}
	if rows != 25 {
		t.Errorf("rows = %d, want 25", rows)
	}
	if offset != 0 {
		t.Errorf("offset = %d, want 0", offset)
	}
}

func TestNormalizeTablePageComputesOffset(t *testing.T) {
	tests := []struct {
		name       string
		params     TablePageParams
		wantPage   int32
		wantRows   int32
		wantOffset int32
	}{
		{"page 1 rows 25", TablePageParams{Page: 1, Rows: 25}, 1, 25, 0},
		{"page 2 rows 25", TablePageParams{Page: 2, Rows: 25}, 2, 25, 25},
		{"page 3 rows 10", TablePageParams{Page: 3, Rows: 10}, 3, 10, 20},
		{"negative page defaults to 1", TablePageParams{Page: -1, Rows: 10}, 1, 10, 0},
		{"zero rows defaults to 25", TablePageParams{Page: 1, Rows: 0}, 1, 25, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			page, rows, offset := normalizeTablePage(tt.params)
			if page != tt.wantPage {
				t.Errorf("page = %d, want %d", page, tt.wantPage)
			}
			if rows != tt.wantRows {
				t.Errorf("rows = %d, want %d", rows, tt.wantRows)
			}
			if offset != tt.wantOffset {
				t.Errorf("offset = %d, want %d", offset, tt.wantOffset)
			}
		})
	}
}

func TestCanReviewRequestKind(t *testing.T) {
	managerPerms := authorization.EffectiveManagementPermissions{
		Grants: []authorization.ManagementPermission{
			authorization.ManagementPermissionManager,
		},
	}

	tests := []struct {
		name        string
		perms       authorization.EffectiveManagementPermissions
		requestKind string
		want        bool
	}{
		{
			name:        "manager can review personal pod requests",
			perms:       managerPerms,
			requestKind: RequestKindPersonalPodCreate,
			want:        true,
		},
		{
			name:        "manager can review inventory requests",
			perms:       managerPerms,
			requestKind: RequestKindInventoryVMPower,
			want:        true,
		},
		{
			name:        "non-manager cannot review personal pod requests",
			perms:       authorization.EffectiveManagementPermissions{},
			requestKind: RequestKindPersonalPodCreate,
			want:        false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := canReviewRequestKind(tt.perms, tt.requestKind); got != tt.want {
				t.Fatalf("canReviewRequestKind() = %v, want %v", got, tt.want)
			}
		})
	}
}
