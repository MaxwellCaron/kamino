package authorization

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// fakeAuthzDB is a minimal implementation of the dbtx seam (database.DBTX
// plus Begin) that lets Service be exercised without a live database. It is
// modeled on vmactions/claims_test.go's fakeClaimsDB: each query is matched
// by inspecting the SQL string, and results are served from in-memory state
// configured by the test.
type fakeAuthzDB struct {
	mu sync.Mutex

	// effectivePrincipalIDs backs ListEffectivePrincipalIDs, keyed by the
	// queried principal ID.
	effectivePrincipalIDs map[uuid.UUID][]uuid.UUID

	// hasInventoryPermission backs HasInventoryPermission: the configured
	// bool is returned regardless of which mask was requested, unless
	// hasInventoryPermissionErr is set.
	hasInventoryPermission    bool
	hasInventoryPermissionErr error

	// itemWithPermissions backs GetInventoryItemWithPermissions.
	itemWithPermissions    database.GetInventoryItemWithPermissionsRow
	itemWithPermissionsErr error

	// itemByID backs GetInventoryItemByID.
	itemByID    database.GetInventoryItemByIDRow
	itemByIDErr error

	// vmRecord backs GetProxmoxVMByInventoryItemID and
	// GetProxmoxVMByInventoryItemIDForUpdate.
	vmRecord    database.GetProxmoxVMByInventoryItemIDRow
	vmRecordErr error
}

func newFakeAuthzDB() *fakeAuthzDB {
	return &fakeAuthzDB{
		effectivePrincipalIDs: make(map[uuid.UUID][]uuid.UUID),
	}
}

func (f *fakeAuthzDB) Exec(_ context.Context, _ string, _ ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, errors.New("fakeAuthzDB: Exec not supported")
}

// Query backs ListEffectivePrincipalIDs, the only :many query Service
// depends on (through HasProtectedPrincipalAccess ->
// loadEffectivePrincipalIDs).
func (f *fakeAuthzDB) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if !strings.Contains(sql, "FROM get_user_effective_principals") {
		return nil, errors.New("fakeAuthzDB: unsupported Query: " + sql)
	}

	principalID, _ := args[0].(uuid.UUID)
	return &fakeAuthzRows{ids: f.effectivePrincipalIDs[principalID]}, nil
}

func (f *fakeAuthzDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	f.mu.Lock()
	defer f.mu.Unlock()

	switch {
	case strings.Contains(sql, "SELECT has_permission("):
		if f.hasInventoryPermissionErr != nil {
			return fakeAuthzRow{err: f.hasInventoryPermissionErr}
		}
		result := f.hasInventoryPermission
		return fakeAuthzRow{scan: func(dest ...any) error {
			*(dest[0].(*bool)) = result
			return nil
		}}
	case strings.Contains(sql, "FROM get_effective_permissions(") && strings.Contains(sql, "FROM inventory_items ii"):
		if f.itemWithPermissionsErr != nil {
			return fakeAuthzRow{err: f.itemWithPermissionsErr}
		}
		row := f.itemWithPermissions
		return fakeAuthzRow{scan: func(dest ...any) error {
			return scanInventoryItemWithPermissions(row, dest...)
		}}
	case strings.Contains(sql, "FROM inventory_items ii") && strings.Contains(sql, "LEFT JOIN proxmox_vms"):
		if f.itemByIDErr != nil {
			return fakeAuthzRow{err: f.itemByIDErr}
		}
		row := f.itemByID
		return fakeAuthzRow{scan: func(dest ...any) error {
			return scanInventoryItemByID(row, dest...)
		}}
	case strings.Contains(sql, "FROM proxmox_vms"):
		if f.vmRecordErr != nil {
			return fakeAuthzRow{err: f.vmRecordErr}
		}
		row := f.vmRecord
		return fakeAuthzRow{scan: func(dest ...any) error {
			return scanVMRecord(row, dest...)
		}}
	default:
		return fakeAuthzRow{err: errors.New("fakeAuthzDB: unsupported QueryRow query: " + sql)}
	}
}

func (f *fakeAuthzDB) Begin(_ context.Context) (pgx.Tx, error) {
	panic("fakeAuthzDB: Begin not supported — only non-transactional methods are faked")
}

// fakeAuthzRows implements pgx.Rows over an in-memory UUID slice, backing
// fakeAuthzDB.Query's ListEffectivePrincipalIDs fake.
type fakeAuthzRows struct {
	ids []uuid.UUID
	idx int
}

func (r *fakeAuthzRows) Close()                                       {}
func (r *fakeAuthzRows) Err() error                                   { return nil }
func (r *fakeAuthzRows) CommandTag() pgconn.CommandTag                { return pgconn.CommandTag{} }
func (r *fakeAuthzRows) FieldDescriptions() []pgconn.FieldDescription { return nil }
func (r *fakeAuthzRows) Next() bool {
	if r.idx >= len(r.ids) {
		return false
	}
	r.idx++
	return true
}
func (r *fakeAuthzRows) Scan(dest ...any) error {
	*(dest[0].(*uuid.UUID)) = r.ids[r.idx-1]
	return nil
}
func (r *fakeAuthzRows) Values() ([]any, error) { return nil, errors.New("not supported") }
func (r *fakeAuthzRows) RawValues() [][]byte    { return nil }
func (r *fakeAuthzRows) Conn() *pgx.Conn        { return nil }

// fakeAuthzRow implements pgx.Row over a closure so each call site can
// describe its own scan order without a combinatorial explosion of row
// types.
type fakeAuthzRow struct {
	scan func(dest ...any) error
	err  error
}

func (r fakeAuthzRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	return r.scan(dest...)
}

func scanInventoryItemWithPermissions(row database.GetInventoryItemWithPermissionsRow, dest ...any) error {
	*(dest[0].(*uuid.UUID)) = row.ID
	*(dest[1].(**uuid.UUID)) = row.ParentID
	*(dest[2].(*database.InventoryItemKind)) = row.Kind
	*(dest[3].(*string)) = row.Name
	*(dest[4].(**string)) = row.Description
	*(dest[5].(*bool)) = row.InheritPermissions
	*(dest[6].(**int32)) = row.DirectVmLimit
	*(dest[7].(*int32)) = row.EffectiveVmLimit
	*(dest[8].(*int32)) = row.VmCount
	*(dest[9].(**string)) = row.Node
	*(dest[10].(**int32)) = row.Vmid
	*(dest[11].(**string)) = row.GuestType
	*(dest[12].(**bool)) = row.IsTemplate
	*(dest[13].(**string)) = row.Notes
	*(dest[14].(**int32)) = row.CpuCount
	*(dest[15].(**int32)) = row.MemoryMb
	*(dest[16].(**float64)) = row.DiskGb
	*(dest[17].(*int64)) = row.AllowedMask
	*(dest[18].(*int64)) = row.DeniedMask
	return nil
}

func scanInventoryItemByID(row database.GetInventoryItemByIDRow, dest ...any) error {
	*(dest[0].(*uuid.UUID)) = row.ID
	*(dest[1].(**uuid.UUID)) = row.ParentID
	*(dest[2].(*database.InventoryItemKind)) = row.Kind
	*(dest[3].(*string)) = row.Name
	*(dest[4].(**string)) = row.Description
	*(dest[5].(*bool)) = row.InheritPermissions
	*(dest[6].(**int32)) = row.DirectVmLimit
	*(dest[7].(*int32)) = row.EffectiveVmLimit
	*(dest[8].(*int32)) = row.VmCount
	*(dest[9].(**string)) = row.Node
	*(dest[10].(**int32)) = row.Vmid
	*(dest[11].(**string)) = row.GuestType
	*(dest[12].(**bool)) = row.IsTemplate
	*(dest[13].(**string)) = row.Notes
	*(dest[14].(**int32)) = row.CpuCount
	*(dest[15].(**int32)) = row.MemoryMb
	*(dest[16].(**float64)) = row.DiskGb
	return nil
}

func scanVMRecord(row database.GetProxmoxVMByInventoryItemIDRow, dest ...any) error {
	*(dest[0].(*uuid.UUID)) = row.InventoryItemID
	*(dest[1].(*string)) = row.Node
	*(dest[2].(*int32)) = row.Vmid
	*(dest[3].(*string)) = row.GuestType
	*(dest[4].(*uuid.UUID)) = row.UpstreamUuid
	*(dest[5].(*bool)) = row.IsTemplate
	*(dest[6].(**string)) = row.Notes
	*(dest[7].(**int32)) = row.CpuCount
	*(dest[8].(**int32)) = row.MemoryMb
	*(dest[9].(**float64)) = row.DiskGb
	return nil
}

func TestServiceHasAdminGetsFullAccess(t *testing.T) {
	db := newFakeAuthzDB()
	principalID := uuid.New()
	groupID := uuid.New()
	itemID := uuid.New()

	db.effectivePrincipalIDs[principalID] = []uuid.UUID{principalID, groupID}

	svc := NewService(db, []uuid.UUID{groupID})

	allowed, err := svc.Has(context.Background(), principalID, itemID, PowerVM)
	if err != nil {
		t.Fatalf("Has: unexpected error: %v", err)
	}
	if !allowed {
		t.Error("Has: admin principal expected access, got false")
	}
}

func TestServiceEffectivePermissionsAdminGetsFullAccessMask(t *testing.T) {
	db := newFakeAuthzDB()
	principalID := uuid.New()
	groupID := uuid.New()
	itemID := uuid.New()

	db.effectivePrincipalIDs[principalID] = []uuid.UUID{principalID, groupID}
	db.itemByID = database.GetInventoryItemByIDRow{
		ID:   itemID,
		Kind: database.InventoryItemKindVm,
		Name: "admin-vm",
	}

	svc := NewService(db, []uuid.UUID{groupID})

	perms, err := svc.EffectivePermissions(context.Background(), principalID, itemID)
	if err != nil {
		t.Fatalf("EffectivePermissions: unexpected error: %v", err)
	}
	if perms.AllowedMask != FullAccessMask {
		t.Errorf("EffectivePermissions: AllowedMask = %b, want FullAccessMask = %b", perms.AllowedMask, FullAccessMask)
	}
}

func TestServiceHasNonAdminWithAllowMask(t *testing.T) {
	db := newFakeAuthzDB()
	principalID := uuid.New()
	itemID := uuid.New()

	// No protected groups configured at all for this principal's effective
	// principals, so HasProtectedAccess short-circuits to false without
	// needing ListEffectivePrincipalIDs.
	db.hasInventoryPermission = true

	svc := NewService(db, []uuid.UUID{uuid.New()})

	allowed, err := svc.Has(context.Background(), principalID, itemID, PowerVM)
	if err != nil {
		t.Fatalf("Has: unexpected error: %v", err)
	}
	if !allowed {
		t.Error("Has: expected true when HasInventoryPermission reports allowed, got false")
	}
}

func TestServiceHasNonAdminWithoutMask(t *testing.T) {
	db := newFakeAuthzDB()
	principalID := uuid.New()
	itemID := uuid.New()

	db.hasInventoryPermission = false

	svc := NewService(db, []uuid.UUID{uuid.New()})

	allowed, err := svc.Has(context.Background(), principalID, itemID, PowerVM)
	if err != nil {
		t.Fatalf("Has: unexpected error: %v", err)
	}
	if allowed {
		t.Error("Has: expected false when HasInventoryPermission reports denied, got true")
	}
}

// TestServiceEffectivePermissionsDenyWins characterizes current behavior:
// EffectivePermissionsForTargetKind (and EffectivePermissions.Has) only
// consults AllowedMask; the actual deny-vs-allow precedence is resolved
// upstream by the get_effective_permissions SQL function before AllowedMask
// reaches Go. This test locks that boundary: if the DB layer were to return
// an AllowedMask that still includes a denied bit (i.e. SQL-side deny-wins
// did NOT subtract it), EffectivePermissions.Has would incorrectly report
// access for that bit, since DeniedMask is not re-checked in Go.
func TestServiceEffectivePermissionsDenyWins(t *testing.T) {
	db := newFakeAuthzDB()
	principalID := uuid.New()
	itemID := uuid.New()

	// Simulate the SQL function having already applied deny-wins: PowerVM is
	// requested as an allow grant, but because it's also denied, the
	// effective AllowedMask returned by the DB excludes it.
	db.itemWithPermissions = database.GetInventoryItemWithPermissionsRow{
		ID:          itemID,
		Kind:        database.InventoryItemKindVm,
		AllowedMask: int64(View), // PowerVM intentionally absent: deny won upstream.
		DeniedMask:  int64(PowerVM),
	}

	svc := NewService(db, []uuid.UUID{uuid.New()})

	perms, err := svc.EffectivePermissions(context.Background(), principalID, itemID)
	if err != nil {
		t.Fatalf("EffectivePermissions: unexpected error: %v", err)
	}
	if perms.Has(PowerVM) {
		t.Error("EffectivePermissions.Has(PowerVM): expected false (deny-wins), got true")
	}
	if !perms.Has(View) {
		t.Error("EffectivePermissions.Has(View): expected true (allowed, not denied), got false")
	}
}

func TestServiceRequireReturnsErrForbiddenWhenHasFalse(t *testing.T) {
	db := newFakeAuthzDB()
	principalID := uuid.New()
	itemID := uuid.New()

	db.hasInventoryPermission = false

	svc := NewService(db, []uuid.UUID{uuid.New()})

	err := svc.Require(context.Background(), principalID, itemID, PowerVM)
	if !errors.Is(err, ErrForbidden) {
		t.Errorf("Require: expected ErrForbidden, got %v", err)
	}
}

func TestServiceRequireReturnsNilWhenHasTrue(t *testing.T) {
	db := newFakeAuthzDB()
	principalID := uuid.New()
	itemID := uuid.New()

	db.hasInventoryPermission = true

	svc := NewService(db, []uuid.UUID{uuid.New()})

	if err := svc.Require(context.Background(), principalID, itemID, PowerVM); err != nil {
		t.Errorf("Require: expected nil error, got %v", err)
	}
}

func TestHasProtectedAccessNoProtectedGroupsConfigured(t *testing.T) {
	db := newFakeAuthzDB()
	principalID := uuid.New()

	// Empty protectedManagementGroupIDs map: HasProtectedAccess must
	// short-circuit to false without ever calling ListEffectivePrincipalIDs.
	svc := NewService(db, nil)

	isAdmin, err := svc.HasProtectedAccess(context.Background(), principalID)
	if err != nil {
		t.Fatalf("HasProtectedAccess: unexpected error: %v", err)
	}
	if isAdmin {
		t.Error("HasProtectedAccess: expected false with no protected groups configured, got true")
	}
}

func TestGetVMRecordNotFound(t *testing.T) {
	db := newFakeAuthzDB()
	itemID := uuid.New()

	db.vmRecordErr = pgx.ErrNoRows

	svc := NewService(db, nil)

	_, err := svc.GetVMRecord(context.Background(), itemID)
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Errorf("GetVMRecord: expected error wrapping pgx.ErrNoRows, got %v", err)
	}
	if !IsMissingVM(err) {
		t.Errorf("IsMissingVM(err): expected true, got false for err = %v", err)
	}
}

func TestGetVMRecordFound(t *testing.T) {
	db := newFakeAuthzDB()
	itemID := uuid.New()
	upstreamUUID := uuid.New()

	db.vmRecord = database.GetProxmoxVMByInventoryItemIDRow{
		InventoryItemID: itemID,
		Node:            "pve1",
		Vmid:            101,
		GuestType:       "qemu",
		UpstreamUuid:    upstreamUUID,
	}

	svc := NewService(db, nil)

	record, err := svc.GetVMRecord(context.Background(), itemID)
	if err != nil {
		t.Fatalf("GetVMRecord: unexpected error: %v", err)
	}
	if record.Node != "pve1" || record.Vmid != 101 || record.UpstreamUUID != upstreamUUID {
		t.Errorf("GetVMRecord: unexpected record: %+v", record)
	}
}
