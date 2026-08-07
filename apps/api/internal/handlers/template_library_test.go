package handlers

import (
	"context"
	"testing"

	"github.com/MaxwellCaron/kamino/database"
	"github.com/MaxwellCaron/kamino/internal/authorization"
	"github.com/MaxwellCaron/kamino/internal/proxmox"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type fakeTemplateLibraryReader struct {
	fallbackFolderID uuid.UUID
	items            map[uuid.UUID]database.GetInventoryItemByIDRow
	rows             []database.GetAllInventoryItemsRow
}

func (f *fakeTemplateLibraryReader) FindFolderPath(
	context.Context,
	[]string,
) (uuid.UUID, bool, error) {
	return f.fallbackFolderID, f.fallbackFolderID != uuid.Nil, nil
}

func (f *fakeTemplateLibraryReader) GetInventoryItemByID(
	_ context.Context,
	id uuid.UUID,
) (database.GetInventoryItemByIDRow, error) {
	item, found := f.items[id]
	if !found {
		return database.GetInventoryItemByIDRow{}, pgx.ErrNoRows
	}
	return item, nil
}

func (f *fakeTemplateLibraryReader) GetAllInventoryItems(
	context.Context,
) ([]database.GetAllInventoryItemsRow, error) {
	return f.rows, nil
}

func TestLoadTemplateLibraryOptionsUsesOnlyDirectTemplateChildren(t *testing.T) {
	t.Parallel()

	folderID := uuid.New()
	otherFolderID := uuid.New()
	directTemplateID := uuid.New()
	node := "pve1"
	vmid := int32(101)
	isTemplate := true
	isVM := false

	reader := &fakeTemplateLibraryReader{
		items: map[uuid.UUID]database.GetInventoryItemByIDRow{
			folderID: {ID: folderID, Kind: database.InventoryItemKindFolder},
		},
		rows: []database.GetAllInventoryItemsRow{
			{
				ID:         directTemplateID,
				ParentID:   &folderID,
				Kind:       database.InventoryItemKindVm,
				Name:       "Ubuntu",
				Node:       &node,
				Vmid:       &vmid,
				IsTemplate: &isTemplate,
			},
			{
				ID:         uuid.New(),
				ParentID:   &otherFolderID,
				Kind:       database.InventoryItemKindVm,
				Name:       "Outside",
				Node:       &node,
				Vmid:       &vmid,
				IsTemplate: &isTemplate,
			},
			{
				ID:         uuid.New(),
				ParentID:   &folderID,
				Kind:       database.InventoryItemKindVm,
				Name:       "Not a template",
				Node:       &node,
				Vmid:       &vmid,
				IsTemplate: &isVM,
			},
		},
	}

	options, err := loadTemplateLibraryOptions(context.Background(), reader, folderID)
	if err != nil {
		t.Fatalf("loadTemplateLibraryOptions() error = %v", err)
	}
	if len(options) != 1 || options[0].ID != directTemplateID {
		t.Fatalf("options = %#v, want only configured folder template %s", options, directTemplateID)
	}
}

func TestResolveVMCloneSourceDefaultTemplateLibraryBypassesSourceACL(t *testing.T) {
	t.Parallel()

	folderID := uuid.New()
	itemID := uuid.New()
	principalID := uuid.New()
	upstreamUUID := uuid.New()
	isTemplate := true

	reader := &fakeTemplateLibraryReader{fallbackFolderID: folderID, items: map[uuid.UUID]database.GetInventoryItemByIDRow{
		folderID: {ID: folderID, Kind: database.InventoryItemKindFolder},
		itemID: {
			ID:         itemID,
			ParentID:   &folderID,
			Kind:       database.InventoryItemKindVm,
			IsTemplate: &isTemplate,
		},
	}}
	authz := &fakeVMAuthz{
		requireErr: authorization.ErrForbidden,
		vmRecord: authorization.VMRecord{
			InventoryItemID: itemID,
			Node:            "pve1",
			Vmid:            101,
			GuestType:       string(proxmox.GuestQEMU),
			UpstreamUUID:    upstreamUUID,
		},
	}
	px := &fakeVMProxmox{identity: &proxmox.VMIdentity{UpstreamUUID: upstreamUUID, IsTemplate: true}}

	target, reqErr := resolveVMCloneSource(
		context.Background(), authz, px, reader, uuid.Nil, principalID, itemID,
	)
	if reqErr != nil {
		t.Fatalf("resolveVMCloneSource() error = %v", reqErr)
	}
	if target.ItemID != itemID {
		t.Fatalf("target item = %s, want %s", target.ItemID, itemID)
	}
}

func TestResolveVMCloneSourceOutsideLibraryStillRequiresSourceACL(t *testing.T) {
	t.Parallel()

	folderID := uuid.New()
	itemID := uuid.New()
	isTemplate := true
	reader := &fakeTemplateLibraryReader{
		fallbackFolderID: folderID,
		items: map[uuid.UUID]database.GetInventoryItemByIDRow{
			itemID: {
				ID:         itemID,
				ParentID:   new(uuid.UUID),
				Kind:       database.InventoryItemKindVm,
				IsTemplate: &isTemplate,
			},
		},
	}

	_, reqErr := resolveVMCloneSource(
		context.Background(),
		&fakeVMAuthz{requireErr: authorization.ErrForbidden},
		&fakeVMProxmox{},
		reader,
		uuid.Nil,
		uuid.New(),
		itemID,
	)
	if reqErr == nil || reqErr.Status != 403 {
		t.Fatalf("request error = %#v, want forbidden for an out-of-library source", reqErr)
	}
}
